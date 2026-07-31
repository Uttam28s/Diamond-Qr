; Custom NSIS hooks for Diamond QR.
;
; On a genuine uninstall, remove ONLY the licence file. The machine then needs the
; administrator to activate it again on reinstall, which is the intended behaviour.
;
; The ${isUpdated} guard matters: electron-builder runs the uninstaller as part of
; installing a NEW VERSION. Without the guard, every app update would silently
; deactivate the customer's machine and generate a support call.
;
; Scan history and settings live in the same folder but are deliberately left alone --
; deleting a jeweller's scan records on uninstall would be far worse than the small
; convenience of a re-activation.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Electron derives userData from package.json "name", but cover the other
    ; folder names electron-builder itself checks, in case productName is used.
    Delete "$APPDATA\${APP_PACKAGE_NAME}\license.dat"
    Delete "$APPDATA\${APP_FILENAME}\license.dat"
    Delete "$APPDATA\${APP_PRODUCT_FILENAME}\license.dat"
  ${endIf}
!macroend
