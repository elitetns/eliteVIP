ARCHS = arm64
TARGET := iphone:clang:16.5:14.0
include $(THEOS)/makefiles/common.mk

TWEAK_NAME = EvoAssist

EvoAssist_FILES = Tweak.xm Payload.S
EvoAssist_CFLAGS = -fobjc-arc
EvoAssist_FRAMEWORKS = Foundation WebKit

INSTALL_TARGET_PROCESSES = EvoWars

include $(THEOS_MAKE_PATH)/tweak.mk
