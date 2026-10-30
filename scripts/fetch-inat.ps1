# Download Utah Phragmites observations straight from iNaturalist into data/inat-utah.json.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts/fetch-inat.ps1
# This is newer than GBIF's copy of iNaturalist. We keep only location, date, taxon and link;
# no photos and no usernames. Obscured coordinates (sensitive species) are as iNaturalist publishes them.
$taxon = 64237   # Phragmites australis (includes subspecies)
$place = 52      # Utah
$records = @(); $page = 1
do {
  $url = "https://api.inaturalist.org/v1/observations?taxon_id=$taxon&place_id=$place&geo=true&quality_grade=research,needs_id&per_page=200&page=$page&order_by=id&order=asc"
  $res = Invoke-RestMethod $url
  foreach ($o in $res.results) {
    if (-not $o.location) { continue }
    $ll = $o.location -split ","
    $records += [ordered]@{
      id = "inat-$($o.id)"
      lat = [math]::Round([double]$ll[0], 5)
      lng = [math]::Round([double]$ll[1], 5)
      date = $o.observed_on
      taxon = $o.taxon.name
      basis = "HUMAN_OBSERVATION"
      dataset = "iNaturalist ($($o.quality_grade -replace '_',' '))"
      license = $o.license_code
      county = ""
      url = $o.uri
    }
  }
  $page++
  Start-Sleep -Milliseconds 1200   # stay well under iNaturalist's rate limit
} until (($page - 1) * 200 -ge $res.total_results)
$out = [ordered]@{ fetched = (Get-Date -Format "yyyy-MM-dd"); source = "iNaturalist"; records = $records }
$out | ConvertTo-Json -Depth 5 -Compress | Set-Content -Encoding utf8 "data/inat-utah.json"
"$($records.Count) records"
