# build-apk.ps1 — one command to produce the standalone APK:
#   1. vite build (relative base → file:// friendly)
#   2. copy dist/ into android assets/www
#   3. gradle assembleDebug
#   4. copy + rename result to ..\PharmaLab-v1.0.0.apk
# Requires: Node, Android SDK, JDK 17+ (or Android Studio's JBR via gradle.properties).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot   # repo root (script lives in android/)
Set-Location $root

"==> vite build"
npx vite build

"==> stage assets"
$assets = Join-Path $root 'android\app\src\main\assets\www'
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Copy-Item (Join-Path $root 'dist\*') $assets -Recurse

"==> gradle assembleDebug"
Set-Location (Join-Path $root 'android')
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
& $java -classpath 'gradle\wrapper\gradle-wrapper.jar' org.gradle.wrapper.GradleWrapperMain assembleDebug --console=plain -q
if ($LASTEXITCODE) { throw 'gradle build failed' }

"==> result"
$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
$out = Join-Path $root 'PharmaLab-v1.0.0.apk'
Copy-Item $apk $out -Force
"{0}  {1:N0} bytes" -f $out, (Get-Item $out).Length
