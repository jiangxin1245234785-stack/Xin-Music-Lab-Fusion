param([string]$OutputDirectory = "$PSScriptRoot/assets")
$sourceDirectory = Join-Path $PSScriptRoot '../xld-runtime-baseline/assets'
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
foreach ($name in @('xld.ico', 'xld.png')) {
    $source = Get-Item -LiteralPath (Join-Path $sourceDirectory $name) -ErrorAction Stop
    $destination = [IO.Path]::GetFullPath((Join-Path $OutputDirectory $name))
    if ($source.FullName -ne $destination) {
        Copy-Item -LiteralPath $source.FullName -Destination $destination -Force
    }
}
