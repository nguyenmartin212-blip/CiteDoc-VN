param([switch]$WithAI)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $project 'data/processed/runtime'
$tessdata = Join-Path $runtime 'tessdata'
New-Item -ItemType Directory -Path $tessdata -Force | Out-Null

function Get-VerifiedAsset([string]$Url, [string]$Destination, [string]$Sha256) {
    if ((Test-Path -LiteralPath $Destination) -and
        (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Sha256) { return }
    $partial = "$Destination.part"
    curl.exe --fail --location --silent --show-error --retry 2 --max-time 600 $Url -o $partial
    if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Không tải được hoặc checksum sai: $Destination"
    }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}

$tesseract = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0'
Get-VerifiedAsset "$tesseract/eng.traineddata" (Join-Path $tessdata 'eng.traineddata') '7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2'
Get-VerifiedAsset "$tesseract/vie.traineddata" (Join-Path $tessdata 'vie.traineddata') '79DF64CAF7BCFB2A27DF5042ECB6121E196EADA34DA774956995747636D5BFA1'

if ($WithAI) {
    $model = 'qwen2.5-0.5b-instruct-q4_k_m.gguf'
    $modelRepo = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5d'
    Get-VerifiedAsset "$modelRepo/${model}?download=true" (Join-Path $runtime $model) '74A4DA8C9FDBCD15BD1F6D01D621410D31C6FC00986F5EB687824E7B93D7A9DB'
    $arch = node.exe -p 'process.arch'
    if ($LASTEXITCODE -ne 0 -or $arch -notin @('x64', 'arm64')) { throw 'Cần Node.js Windows x64 hoặc arm64.' }
    $version = '3.22.3'
    npm.cmd install --prefix (Join-Path $runtime 'node') --omit=optional --ignore-scripts --no-audit --no-fund "node-llama-cpp@$version" "@node-llama-cpp/win-$arch@$version"
    if ($LASTEXITCODE -ne 0) { throw 'Không cài được runtime AI.' }
}
