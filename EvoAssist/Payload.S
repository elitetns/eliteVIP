.section __TEXT,__evojs,regular,no_dead_strip
.p2align 2
.globl _EAPayloadStart
_EAPayloadStart:
.incbin "layout/Library/Application Support/EvoAssist/evoassist.js"
.globl _EAPayloadEnd
_EAPayloadEnd:
.byte 0
