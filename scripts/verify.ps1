#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Container }, ErrorMessage = 'RootPath must be an existing directory.')]
    [string]$RootPath = (Split-Path -Parent $PSScriptRoot)
    ,[switch]$SkipGitDiffCheck
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $RootPath).Path
$failed = $false

function Write-Check {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    try {
        & $Action
        Write-Host "PASS $Name" -ForegroundColor Green
    } catch {
        $script:failed = $true
        Write-Host "FAIL ${Name}: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Require-File {
    param(
        [string]$RelativePath,
        [int]$MinBytes = 0
    )

    $path = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "missing file: $RelativePath"
    }
    if ($MinBytes -gt 0 -and (Get-Item -LiteralPath $path).Length -lt $MinBytes) {
        throw "file is empty or truncated: $RelativePath"
    }
    return $path
}

Write-Host "Verifying $root"

Write-Check 'JavaScript syntax (product files)' {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'node executable not found on PATH'
    }
    $files = Get-ChildItem -LiteralPath $root -Filter '*.js' -File -Recurse |
        Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|\.cache|backups|history)[\\/]' }
    if ($files.Count -eq 0) {
        throw 'no product JavaScript files found'
    }
    foreach ($file in $files) {
        $output = & node --check $file.FullName 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            $trimmedOutput = $output.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmedOutput)) {
                $trimmedOutput = '(node --check produced no output)'
            }
            throw "$($file.Name): $trimmedOutput"
        }
    }
}

$manifest = $null
Write-Check 'manifest.json parses as JSON' {
    $manifestPath = Require-File 'manifest.json'
    $script:manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($script:manifest.manifest_version -ne 3) {
        throw "expected manifest_version 3, got $($script:manifest.manifest_version)"
    }
}

Write-Check 'manifest has MAIN-first content scripts' {
    if ($null -eq $manifest) {
        throw 'manifest was not parsed'
    }
    $contentScripts = @($manifest.content_scripts)
    if ($contentScripts.Count -ne 4) {
        throw "content_scripts must contain exactly 4 entries (MAIN, image context, ISOLATED unblocker, crop overlay), got $($contentScripts.Count)"
    }
    $main = $contentScripts[0]
    $imageContext = $contentScripts[1]
    $isolated = $contentScripts[2]
    $mainJs = @($main.js)
    $imageContextJs = @($imageContext.js)
    $isolatedJs = @($isolated.js)
    $cropJs = @($contentScripts[3].js)
    $imageContextWorld = if ($imageContext.PSObject.Properties['world']) { $imageContext.world } else { $null }
    $isolatedWorld = if ($isolated.PSObject.Properties['world']) { $isolated.world } else { $null }
    if ($main.world -ne 'MAIN' -or $mainJs.Count -lt 1 -or $mainJs[0] -ne 'content-main.js') {
        throw 'content_scripts[0] must load content-main.js in MAIN world'
    }
    if ($imageContextJs.Count -ne 1 -or $imageContextJs[0] -ne 'image-context.js' -or
        $imageContextWorld -eq 'MAIN' -or
        $imageContext.run_at -ne 'document_start' -or $imageContext.all_frames -ne $true -or
        $imageContext.match_about_blank -ne $true -or $imageContext.match_origin_as_fallback -ne $true) {
        throw 'content_scripts[1] must load image-context.js as an all-frame document_start fallback-aware ISOLATED script'
    }
    if ($isolatedJs -notcontains 'content.js' -or $isolatedJs -notcontains 'shared.js' -or
        $isolatedWorld -eq 'MAIN' -or
        $isolated.run_at -ne 'document_start' -or $isolated.all_frames -ne $true -or
        $isolated.match_about_blank -ne $true -or $isolated.match_origin_as_fallback -ne $true) {
        throw 'content_scripts[2] must load shared.js and content.js after image-context.js with matching all-frame document_start coverage'
    }
    if ($cropJs.Count -lt 2 -or $cropJs[0] -ne 'keyboard-utils.js' -or $cropJs[$cropJs.Count-1] -ne 'crop-overlay.js') {
        throw 'crop overlay entry is missing or out of order'
    }
}

Write-Check 'content-main.js blocked-event allowlist is contextmenu/selectstart/dragstart' {
    $contentMainPath = Require-File 'content-main.js'
    $source = Get-Content -LiteralPath $contentMainPath -Raw
    if ($source -notmatch 'BLOCKED_EVENT_NAMES\s*=\s*Object\.freeze\(\s*\[([\s\S]*?)\]\s*\)') {
        throw 'BLOCKED_EVENT_NAMES array not found in content-main.js'
    }
    $raw = $matches[1]
    $names = ([regex]::Matches($raw, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
    $expected = @('contextmenu', 'selectstart', 'dragstart')
    if (($names -join ',') -ne ($expected -join ',')) {
        throw "expected [$($expected -join ', ')], got [$($names -join ', ')]"
    }
    $codeOnly = [regex]::Replace($source, '//[^\n]*', '')
    $codeOnly = [regex]::Replace($codeOnly, '/\*[\s\S]*?\*/', '')
    if ($codeOnly -match 'chrome\.storage|chrome\.runtime|domainSettings|isDomainEnabled|resolveDomainKey') {
        throw 'content-main.js must not reference chrome.storage, chrome.runtime, domainSettings, isDomainEnabled, or resolveDomainKey'
    }
}

Write-Check 'required product and local OCR assets exist' {
    @(
        'content-main.js', 'content.js', 'shared.js', 'background.js',
        'popup.js', 'options.js', 'crop-overlay.js', 'image-context.js', 'ocr-history.js', 'offscreen.js',
        'offscreen.html', 'ocr-image-utils.js', 'icons/icon512.png',
        'langs/kor.traineddata.gz', 'langs/eng.traineddata.gz',
        'lib/worker.min.js'
    ) | ForEach-Object { [void](Require-File $_) }
    [void](Require-File 'icons/icon128.png' 512)
    [void](Require-File 'lib/tesseract.min.js' 1024)
    [void](Require-File 'lib/tesseract-core-simd-lstm.wasm.js' 4096)
    [void](Require-File 'lib/tesseract-core-lstm.wasm.js' 4096)
}

Write-Check 'background package lists local OCR helpers before the worker' {
    if ($null -eq $manifest) {
        throw 'manifest was not parsed'
    }
    $backgroundProperty = $manifest.PSObject.Properties['background']
    if ($null -eq $backgroundProperty -or $null -eq $backgroundProperty.Value) {
        throw 'manifest.background must declare scripts or service_worker'
    }
    $background = $backgroundProperty.Value
    $serviceWorkerProperty = $background.PSObject.Properties['service_worker']
    $scriptsProperty = $background.PSObject.Properties['scripts']
    $hasServiceWorker = $null -ne $serviceWorkerProperty
    $hasScripts = $null -ne $scriptsProperty
    if (-not $hasServiceWorker -and -not $hasScripts) {
        throw 'manifest.background must declare scripts or service_worker'
    }
    if ($hasServiceWorker) {
        [void](Require-File $serviceWorkerProperty.Value)
    }
    if ($hasScripts) {
        $backgroundScripts = @($scriptsProperty.Value)
        foreach ($script in $backgroundScripts) {
            [void](Require-File $script)
        }
        $imageContextIndex = [array]::IndexOf($backgroundScripts, 'image-context.js')
        $ocrHistoryIndex = [array]::IndexOf($backgroundScripts, 'ocr-history.js')
        $workerIndex = [array]::IndexOf($backgroundScripts, 'background.js')
        if ($imageContextIndex -lt 0 -or $ocrHistoryIndex -lt 0 -or $workerIndex -lt 0 -or
            $imageContextIndex -ge $workerIndex -or $ocrHistoryIndex -ge $workerIndex) {
            throw 'background scripts must load image-context.js and ocr-history.js before background.js'
        }
    }
}

Write-Check 'offscreen.html uses only local OCR scripts' {
    $html = Get-Content -LiteralPath (Require-File 'offscreen.html') -Raw
    $scripts = [regex]::Matches($html, '<script\b[^>]*\bsrc=["'']([^"'']+)["'']', 'IgnoreCase') |
        ForEach-Object { $_.Groups[1].Value }
    $expected = @('ocr-image-utils.js', 'lib/tesseract.min.js', 'offscreen.js')
    if (($scripts -join '|') -ne ($expected -join '|')) {
        throw "expected scripts '$($expected -join ', ')', got '$($scripts -join ', ')'"
    }
    foreach ($script in $scripts) {
        if ($script -match '^(https?:|//|/)') {
            throw "non-local offscreen script: $script"
        }
        [void](Require-File $script)
    }
}

if ($SkipGitDiffCheck) {
    Write-Host 'SKIP git diff --check: explicit -SkipGitDiffCheck fixture mode' -ForegroundColor Yellow
} else {
    Write-Check 'git diff --check' {
        if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) {
            throw "root is not a git worktree: $root"
        }
        & git -C $root diff --check 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw 'git diff --check reported whitespace errors'
        }
    }
}

if ($failed) {
    Write-Host 'Verification failed.' -ForegroundColor Red
    exit 1
}

Write-Host 'Verification passed.' -ForegroundColor Green
exit 0
