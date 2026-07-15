param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\data\monuments.json'),
  [int]$Limit = 2500
)

$ErrorActionPreference = 'Stop'
$endpoint = 'https://query.wikidata.org/sparql'
$query = @"
SELECT DISTINCT ?item ?itemLabel ?article ?image WHERE {
  ?item wdt:P17 wd:Q45;
        wdt:P1435 ?heritageStatus;
        wdt:P18 ?image.
  OPTIONAL {
    ?article schema:about ?item;
             schema:isPartOf <https://pt.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}
LIMIT $Limit
"@

$uri = $endpoint + '?query=' + [uri]::EscapeDataString($query) + '&format=json'
$headers = @{ 'User-Agent' = 'PortugalOuMisterio/1.0 (educational quiz)' }
$response = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 180

$monuments = $response.results.bindings | ForEach-Object {
  $qid = $_.item.value -replace '^.*/', ''
  $imageUrl = $_.image.value
  $imageFile = [uri]::UnescapeDataString(($imageUrl -replace '^.*/', '')) -replace '_', ' '
  [pscustomobject]@{
    id = ('monument-' + $qid)
    name = $_.itemLabel.value
    articleTitle = $_.itemLabel.value
    description = $null
    image = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + [uri]::EscapeDataString(($imageFile -replace ' ', '_')) + '?width=1280'
    imageFile = $imageFile
    articleUrl = if ($_.article.value) { $_.article.value } else { $_.item.value }
    imageInfoUrl = 'https://commons.wikimedia.org/wiki/File:' + [uri]::EscapeDataString(($imageFile -replace ' ', '_'))
  }
} | Where-Object {
  $_.name -and $_.name -notmatch '^Q\d+$' -and $_.name -notmatch '^Castelo (de |da |do |dos |das )'
} | Group-Object name | ForEach-Object { $_.Group | Select-Object -First 1 } | Sort-Object name

$outDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$monuments | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputPath -Encoding utf8
Write-Host "Guardados $($monuments.Count) monumentos com fotografia em $OutputPath"
