@echo off
setlocal EnableExtensions
set "THEOS=/c/theos"
set "MSYSTEM=MSYS"
set "CHERE_INVOKING=1"
"C:\msys64\usr\bin\bash.exe" --login -c "source /c/theos/theos-env.sh; cd \"$(cygpath -u '%CD%')\" && make %*"
