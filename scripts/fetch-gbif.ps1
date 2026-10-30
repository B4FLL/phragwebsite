# Download Utah Phragmites occurrences from GBIF into data/gbif-utah.json.
# Run from the project root:  powershell -File scripts/fetch-gbif.ps1
# Skips iNaturalist-sourced records (fetch-inat.ps1 pulls those directly, with more recent data).
# Records keep their license + dataset so the site can credit the source.
$base = "https://api.gbif.org/v1/occurrence/search"
$q = "scientificName=Phragmites%20australis&stateProvince=Utah&country=US&hasCoordinate=true&hasGeospatialIssue=false&limit=300"
$records = @(); $offset = 0
do {
  $page = Invoke-RestMethod "$base`?$q&offset=$offset"
  foreach ($o in $page.results) {
    # iNaturalist observations are fetched directly (newer) by fetch-inat.ps1
    if ($o.datasetName -match "iNaturalist") { continue }
    $ds = if ($o.datasetName) { $o.datasetName } else { $o.institutionCode }
    $records += [ordered]@{
      id = "gbif-$($o.key)"
      lat = [math]::Round($o.decimalLatitude, 5)
      lng = [math]::Round($o.decimalLongitude, 5)
      date = if ($o.eventDate) { $o.eventDate.Substring(0, [math]::Min(10, $o.eventDate.Length)) } else { "" }
      taxon = $o.scientificName
      basis = $o.basisOfRecord
      dataset = $ds
      license = $o.license
      county = $o.county
      url = "https://www.gbif.org/occurrence/$($o.key)"
    }
  }
  $offset += 300
} until ($page.endOfRecords)
$out = [ordered]@{ fetched = (Get-Date -Format "yyyy-MM-dd"); source = "GBIF.org"; records = $records }
$out | ConvertTo-Json -Depth 5 -Compress | Set-Content -Encoding utf8 "data/gbif-utah.json"
"$($records.Count) records"
