param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\data\castles.json')
)

$ErrorActionPreference = 'Stop'
$api = 'https://pt.wikipedia.org/w/api.php'
$listTitle = 'Lista_de_fortificações_de_Portugal'

function Invoke-WikiApi([hashtable]$Parameters) {
  $Parameters.format = 'json'
  $Parameters.formatversion = '2'
  $Parameters.origin = '*'
  Invoke-RestMethod -Uri $api -Method Get -Body $Parameters -TimeoutSec 60
}

$parsed = Invoke-WikiApi @{ action = 'parse'; page = $listTitle; prop = 'links' }
$titles = $parsed.parse.links |
  Where-Object { $_.ns -eq 0 -and $_.title -match '^Castelo (de |da |do |dos |das )' } |
  Select-Object -ExpandProperty title -Unique |
  Sort-Object

$pages = @()
for ($i = 0; $i -lt $titles.Count; $i += 50) {
  $batch = $titles[$i..([Math]::Min($i + 49, $titles.Count - 1))] -join '|'
  $response = Invoke-WikiApi @{
    action = 'query'; titles = $batch; redirects = '1'
    prop = 'pageimages|description'; piprop = 'thumbnail|name'; pithumbsize = '1280'
  }
  $pages += $response.query.pages
}

$castles = $pages |
  Where-Object { -not $_.missing -and $_.thumbnail.source -and $_.pageimage } |
  ForEach-Object {
    $name = $_.title -replace '\s*\([^)]*\)\s*$', ''
    [pscustomobject]@{
      id = ('castle-' + $_.pageid)
      name = $name
      articleTitle = $_.title
      description = $_.description
      image = $_.thumbnail.source
      imageFile = $_.pageimage
      articleUrl = 'https://pt.wikipedia.org/wiki/' + [uri]::EscapeDataString(($_.title -replace ' ', '_'))
      imageInfoUrl = 'https://commons.wikimedia.org/wiki/File:' + [uri]::EscapeDataString(($_.pageimage -replace ' ', '_'))
    }
  } |
  Group-Object name |
  ForEach-Object { $_.Group | Select-Object -First 1 } |
  Sort-Object name

$outDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$castles | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputPath -Encoding utf8
Write-Host "Guardados $($castles.Count) castelos com fotografia em $OutputPath"


