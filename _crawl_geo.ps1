$ErrorActionPreference = "Stop"
$dir = "C:\Users\13766\Desktop\travel-recommender-v2"
$tmp = Join-Path $dir "_geo_tmp"
New-Item -ItemType Directory -Force $tmp | Out-Null
$ProgressPreference = "SilentlyContinue"

function Get-Json($url, $out) {
  for ($i = 0; $i -lt 3; $i++) {
    & curl.exe -sSL -m 90 --noproxy "*" -o $out $url 2>$null
    if (Test-Path $out) {
      $sz = (Get-Item $out).Length
      if ($sz -gt 10) {
        $head = Get-Content $out -TotalCount 1
        if ($head -match '^\s*\{') { return $true }
      }
    }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Parse-Json($path) {
  try {
    $raw = Get-Content $path -Raw -Encoding UTF8
    return ($raw | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-Center($props) {
  if ($props.center -and $props.center -ne "") { return [string]$props.center }
  if ($props.centroid -and $props.centroid -ne "") { return [string]$props.centroid }
  return ""
}

$china = Get-Content (Join-Path $dir "china.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$provinces = @()
foreach ($f in $china.features) {
  $provinces += [pscustomobject]@{ name=[string]$f.properties.name; adcode=[string]$f.properties.adcode; center=(Get-Center $f.properties); level=[string]$f.properties.level }
}
Write-Output ("provinces: " + $provinces.Count)

$all = New-Object System.Collections.ArrayList
$skipped = New-Object System.Collections.ArrayList
$n = 0
foreach ($p in $provinces) {
  $n++
  $pf = Join-Path $tmp ($p.adcode + "_full.json")
  $pj = $null
  if (Test-Path $pf) { $pj = Parse-Json $pf }
  if ($null -eq $pj) {
    if (-not (Get-Json ("https://geo.datav.aliyun.com/areas_v3/bound/" + $p.adcode + "_full.json") $pf)) {
      [void]$skipped.Add("province:" + $p.name)
      continue
    }
    $pj = Parse-Json $pf
    if ($null -eq $pj) { [void]$skipped.Add("province-badjson:" + $p.name); continue }
  }

  [void]$all.Add([pscustomobject]@{ name=$p.name; adcode=$p.adcode; center=$p.center; level="province"; provinceName=$p.name; cityName="" })

  foreach ($cf in $pj.features) {
    $cname   = [string]$cf.properties.name
    $cadcode = [string]$cf.properties.adcode
    $ccenter = (Get-Center $cf.properties)
    $clevel  = [string]$cf.properties.level
    if ($clevel -eq "city") {
      [void]$all.Add([pscustomobject]@{ name=$cname; adcode=$cadcode; center=$ccenter; level="city"; provinceName=$p.name; cityName=$cname })
      $df = Join-Path $tmp ($cadcode + "_full.json")
      $dj = $null
      if (Test-Path $df) { $dj = Parse-Json $df }
      if ($null -eq $dj) {
        if (Get-Json ("https://geo.datav.aliyun.com/areas_v3/bound/" + $cadcode + "_full.json") $df) {
          $dj = Parse-Json $df
        }
      }
      if ($null -ne $dj) {
        foreach ($ef in $dj.features) {
          if ([string]$ef.properties.level -eq "district") {
            [void]$all.Add([pscustomobject]@{ name=[string]$ef.properties.name; adcode=[string]$ef.properties.adcode; center=(Get-Center $ef.properties); level="district"; provinceName=$p.name; cityName=$cname })
          }
        }
      } else {
        [void]$skipped.Add("city:" + $cname + ":" + $cadcode)
      }
      Start-Sleep -Milliseconds 30
    } elseif ($clevel -eq "district") {
      [void]$all.Add([pscustomobject]@{ name=$cname; adcode=$cadcode; center=$ccenter; level="district"; provinceName=$p.name; cityName=$p.name })
    }
  }
  if ($n % 5 -eq 0) { Write-Output ("done " + $n + "/" + $provinces.Count + "  areas=" + $all.Count) }
}

$all | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $dir "raw_areas.json") -Encoding UTF8
Write-Output ("TOTAL AREAS: " + $all.Count)
Write-Output ("SKIPPED (" + $skipped.Count + "):")
$skipped | ForEach-Object { Write-Output ("  " + $_) }
