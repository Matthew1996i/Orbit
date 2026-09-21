$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '..\runtime'
$python = Join-Path $runtime 'python'
$node = Join-Path $runtime 'node'
New-Item -ItemType Directory -Force $runtime | Out-Null
if (-not (Test-Path (Join-Path $python 'python.exe'))) {
  $tmp = Join-Path $env:TEMP "orbit-runtime-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Force $tmp | Out-Null
  try {
    $pyZip = Join-Path $tmp 'python.zip'
    Invoke-WebRequest "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip" -OutFile $pyZip
    Expand-Archive $pyZip $python
    $pth = Get-ChildItem $python -Filter 'python*._pth' | Select-Object -First 1
    Add-Content $pth.FullName 'Lib\site-packages'
    Add-Content $pth.FullName 'import site'
    $wheel = Join-Path $tmp 'pywinpty.whl'
    Invoke-WebRequest 'https://files.pythonhosted.org/packages/py3/p/pywinpty/pywinpty-3.0.5-cp312-cp312-win_amd64.whl' -OutFile $wheel
    Expand-Archive $wheel (Join-Path $python 'Lib\site-packages')
  } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
if (-not (Test-Path (Join-Path $node 'node.exe'))) {
  throw 'Node runtime ausente. Instale Node 24 antes de preparar o runtime.'
}
