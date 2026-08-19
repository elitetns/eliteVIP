#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

static NSString *const EATargetBundleIdentifier = @"com.nightsteed.evowarsio";
static NSString *const EALogHandlerName = @"evoAssistLog";
static char EAInjectedControllerKey;
static char EALogHandlerKey;

#ifdef __cplusplus
extern "C" {
#endif
extern const unsigned char EAPayloadStart[];
extern const unsigned char EAPayloadEnd[];
#ifdef __cplusplus
}
#endif

static BOOL EAIsTargetProcess(void) {
    return [[[NSBundle mainBundle] bundleIdentifier] isEqualToString:EATargetBundleIdentifier];
}

static NSString *EALogPath(void) {
    NSString *documents = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,
                                                               NSUserDomainMask,
                                                               YES).firstObject;
    if (documents.length == 0) {
        documents = NSTemporaryDirectory();
    }
    return [documents stringByAppendingPathComponent:@"EvoAssist-Debug.txt"];
}

static void EALog(NSString *format, ...) NS_FORMAT_FUNCTION(1, 2);
static void EALog(NSString *format, ...) {
    va_list arguments;
    va_start(arguments, format);
    NSString *message = [[NSString alloc] initWithFormat:format arguments:arguments];
    va_end(arguments);

    NSLog(@"[EvoAssist] %@", message);
    @synchronized (EATargetBundleIdentifier) {
        NSString *path = EALogPath();
        NSFileManager *fileManager = [NSFileManager defaultManager];
        NSDictionary *attributes = [fileManager attributesOfItemAtPath:path error:nil];
        if ([attributes fileSize] > 2 * 1024 * 1024) {
            [fileManager removeItemAtPath:path error:nil];
        }

        static NSISO8601DateFormatter *formatter = nil;
        static dispatch_once_t formatterToken;
        dispatch_once(&formatterToken, ^{
            formatter = [[NSISO8601DateFormatter alloc] init];
            formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime |
                                      NSISO8601DateFormatWithFractionalSeconds;
        });

        NSString *line = [NSString stringWithFormat:@"[%@] %@\n",
                          [formatter stringFromDate:[NSDate date]],
                          message];
        NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
        if (![fileManager fileExistsAtPath:path]) {
            [data writeToFile:path atomically:YES];
            return;
        }

        NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
        @try {
            [handle seekToEndOfFile];
            [handle writeData:data];
        } @catch (NSException *exception) {
            NSLog(@"[EvoAssist] Could not append debug log: %@", exception);
        } @finally {
            [handle closeFile];
        }
    }
}

static NSString *EAEmbeddedPayload(void) {
    static NSString *payload = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        NSUInteger length = (NSUInteger)(EAPayloadEnd - EAPayloadStart);
        payload = [[NSString alloc] initWithBytes:EAPayloadStart
                                          length:length
                                        encoding:NSUTF8StringEncoding];
        if (payload.length == 0) {
            EALog(@"ERROR embedded payload is empty or invalid UTF-8 (%lu bytes)",
                  (unsigned long)length);
            payload = nil;
        } else {
            EALog(@"Embedded payload loaded (%lu bytes)", (unsigned long)length);
        }
    });
    return payload;
}

@interface EALogScriptHandler : NSObject <WKScriptMessageHandler>
@end

@implementation EALogScriptHandler
- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    (void)userContentController;
    NSString *text = nil;
    if ([message.body isKindOfClass:[NSString class]]) {
        text = message.body;
    } else if ([NSJSONSerialization isValidJSONObject:message.body]) {
        NSData *data = [NSJSONSerialization dataWithJSONObject:message.body options:0 error:nil];
        text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    } else {
        text = [message.body description];
    }
    if (text.length > 4000) {
        text = [[text substringToIndex:4000] stringByAppendingString:@" ...[truncated]"];
    }
    EALog(@"JS %@", text ?: @"(null)");
}
@end

static NSString *EABootstrapSource(void) {
    NSString *payload = EAEmbeddedPayload();
    if (payload.length == 0) {
        return nil;
    }

    NSString *prelude =
        @"(function(){try{"
         "window.__EvoAssistNativeLog=function(value){try{"
         "window.webkit.messageHandlers.evoAssistLog.postMessage(String(value));"
         "}catch(ignore){}};"
         "window.addEventListener('error',function(event){"
         "window.__EvoAssistNativeLog('window.error: '+event.message+' @ '+event.filename+':'+event.lineno);"
         "});"
         "window.addEventListener('unhandledrejection',function(event){"
         "window.__EvoAssistNativeLog('unhandledrejection: '+String(event.reason));"
         "});"
         "window.__EvoAssistNativeLog('bootstrap executing; readyState='+document.readyState);"
         "}catch(ignore){}})();\n";
    return [prelude stringByAppendingString:payload];
}

static void EAInjectPayload(WKWebViewConfiguration *configuration) {
    if (!EAIsTargetProcess() || !configuration) {
        return;
    }

    WKUserContentController *controller = configuration.userContentController;
    if (!controller) {
        EALog(@"ERROR WKWebView configuration has no user content controller");
        return;
    }
    if (objc_getAssociatedObject(controller, &EAInjectedControllerKey)) {
        return;
    }

    NSString *source = EABootstrapSource();
    if (source.length == 0) {
        EALog(@"ERROR bootstrap source is empty");
        return;
    }

    EALogScriptHandler *handler = [[EALogScriptHandler alloc] init];
    @try {
        [controller addScriptMessageHandler:handler name:EALogHandlerName];
    } @catch (NSException *exception) {
        EALog(@"Log handler registration warning: %@", exception.reason);
    }

    WKUserScript *script = [[WKUserScript alloc]
        initWithSource:source
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart
        forMainFrameOnly:YES];
    [controller addUserScript:script];
    objc_setAssociatedObject(controller,
                             &EAInjectedControllerKey,
                             @YES,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(controller,
                             &EALogHandlerKey,
                             handler,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    EALog(@"Payload registered at document-start (%lu characters)",
          (unsigned long)source.length);
}

static void EAEvaluatePayload(WKWebView *webView, NSString *reason, NSTimeInterval delay) {
    if (!EAIsTargetProcess() || !webView) {
        return;
    }

    __weak WKWebView *weakWebView = webView;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        WKWebView *strongWebView = weakWebView;
        NSString *source = EABootstrapSource();
        if (!strongWebView || source.length == 0) {
            return;
        }
        NSString *probe = [source stringByAppendingString:
            @"\n;({loaded:!!window.EvoAssist,root:!!document.getElementById('evoassist-root'),"
             "state:document.readyState,url:String(location.href)});"];
        [strongWebView evaluateJavaScript:probe completionHandler:^(id result, NSError *error) {
            if (error) {
                EALog(@"Fallback eval [%@, %.1fs] ERROR: %@", reason, delay, error);
            } else {
                EALog(@"Fallback eval [%@, %.1fs] result: %@", reason, delay, result);
            }
        }];
    });
}

static void EAScheduleFallbacks(WKWebView *webView, NSString *reason) {
    EAEvaluatePayload(webView, reason, 0.15);
    EAEvaluatePayload(webView, reason, 1.0);
    EAEvaluatePayload(webView, reason, 3.0);
}

%hook WKWebView

- (instancetype)initWithFrame:(CGRect)frame
                 configuration:(WKWebViewConfiguration *)configuration {
    EAInjectPayload(configuration);
    WKWebView *webView = %orig(frame, configuration);
    EALog(@"WKWebView initWithFrame:configuration: %@", webView);
    return webView;
}

- (instancetype)initWithCoder:(NSCoder *)coder {
    WKWebView *webView = %orig(coder);
    EAInjectPayload(webView.configuration);
    EALog(@"WKWebView initWithCoder: %@", webView);
    return webView;
}

- (void)didMoveToWindow {
    %orig;
    EALog(@"WKWebView didMoveToWindow URL=%@", self.URL.absoluteString ?: @"(nil)");
    EAScheduleFallbacks(self, @"didMoveToWindow");
}

- (WKNavigation *)loadRequest:(NSURLRequest *)request {
    EALog(@"WKWebView loadRequest: %@", request.URL.absoluteString ?: @"(nil)");
    WKNavigation *navigation = %orig(request);
    EAScheduleFallbacks(self, @"loadRequest");
    return navigation;
}

- (WKNavigation *)loadFileURL:(NSURL *)URL allowingReadAccessToURL:(NSURL *)readAccessURL {
    EALog(@"WKWebView loadFileURL: %@", URL.absoluteString ?: @"(nil)");
    WKNavigation *navigation = %orig(URL, readAccessURL);
    EAScheduleFallbacks(self, @"loadFileURL");
    return navigation;
}

- (WKNavigation *)loadHTMLString:(NSString *)string baseURL:(NSURL *)baseURL {
    EALog(@"WKWebView loadHTMLString baseURL=%@", baseURL.absoluteString ?: @"(nil)");
    WKNavigation *navigation = %orig(string, baseURL);
    EAScheduleFallbacks(self, @"loadHTMLString");
    return navigation;
}

%end


%ctor {
    @autoreleasepool {
        if (EAIsTargetProcess()) {
            EALog(@"========== EvoAssist 2.0.0 loaded ==========");
            EALog(@"Process=%@ bundle=%@ log=%@",
                  NSProcessInfo.processInfo.processName,
                  NSBundle.mainBundle.bundleIdentifier,
                  EALogPath());
            (void)EAEmbeddedPayload();
        }
    }
}
