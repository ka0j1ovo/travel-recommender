$ErrorActionPreference = "Stop"
$dir = "C:\Users\13766\Desktop\travel-recommender-v2"

$overrides = @{
  "重庆主城" = "重庆市"
  "三明沙县" = "沙县"
  "西双版纳景洪" = "景洪市"
  "迪庆（香格里拉/德钦）" = "香格里拉市"
  "阿坝州" = "阿坝藏族羌族自治州"
  "大理" = "大理市"
}

function Parse-LL($s) {
  if (-not $s) { return $null }
  $parts = @($s -split '[\s,]+' | Where-Object { $_ -ne "" })
  if ($parts.Count -lt 2) { return $null }
  $lng = [double]$parts[0]
  $lat = [double]$parts[1]
  if ($lng -eq 0 -and $lat -eq 0) { return $null }
  return [pscustomobject]@{ lng = $lng; lat = $lat }
}

# —— 读原始区域 ——
$raw = Get-Content (Join-Path $dir "raw_areas.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$areas = @()
foreach ($a in $raw) {
  $ll = Parse-LL $a.center
  $areas += [pscustomobject]@{
    name = [string]$a.name
    adcode = [string]$a.adcode
    lng = $(if ($ll) { $ll.lng } else { $null })
    lat = $(if ($ll) { $ll.lat } else { $null })
    level = [string]$a.level
    provinceName = [string]$a.provinceName
    cityName = [string]$a.cityName
  }
}
Write-Output ("areas loaded: " + $areas.Count)

# —— 省份列表以 china.json 为准（含台湾，排除南海诸岛九段线占位） ——
$china = Get-Content (Join-Path $dir "china.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$provinces = @()
foreach ($f in $china.features) {
  $nm = [string]$f.properties.name
  if ($nm -eq "" -or [string]$f.properties.level -ne "province") { continue }
  $ll = Parse-LL $f.properties.center
  $provinces += [pscustomobject]@{
    name = $nm
    adcode = [string]$f.properties.adcode
    lng = $(if ($ll) { $ll.lng } else { $null })
    lat = $(if ($ll) { $ll.lat } else { $null })
  }
}
Write-Output ("provinces from china.json: " + $provinces.Count)

# —— 建省市县树 ——
$tree = @()
foreach ($prov in $provinces) {
  $children = @()
  $cityNamesSet = @{}
  $cities = @($areas | Where-Object { $_.level -eq "city" -and $_.provinceName -eq $prov.name })
  foreach ($c in $cities) {
    $cityNamesSet[$c.name] = $true
    $dists = @($areas | Where-Object { $_.level -eq "district" -and $_.cityName -eq $c.name })
    $cnodes = @()
    foreach ($d in $dists) {
      $cnodes += [pscustomobject]@{ name=$d.name; adcode=$d.adcode; lng=$d.lng; lat=$d.lat }
    }
    $children += [pscustomobject]@{ name=$c.name; adcode=$c.adcode; lng=$c.lng; lat=$c.lat; children=$cnodes }
  }
  $dists = @($areas | Where-Object { $_.level -eq "district" -and $_.provinceName -eq $prov.name -and -not $cityNamesSet.ContainsKey($_.cityName) })
  foreach ($d in $dists) {
    $children += [pscustomobject]@{ name=$d.name; adcode=$d.adcode; lng=$d.lng; lat=$d.lat; children=@() }
  }
  $tree += [pscustomobject]@{ name=$prov.name; adcode=$prov.adcode; lng=$prov.lng; lat=$prov.lat; children=$children }
}
Write-Output ("provinces in tree: " + $tree.Count)

# —— 匹配 99 城市坐标 ——
function Resolve-City($name, $prov) {
  $key = $name
  if ($overrides.ContainsKey($name)) { $key = $overrides[$name] }
  $cands = @($areas | Where-Object {
    $_.name -eq $key -or ($_.name.Length -ge $key.Length -and $_.name.Substring(0, $key.Length) -eq $key)
  })
  if ($cands.Count -eq 0) { return $null }
  $provCands = @($cands | Where-Object { $_.provinceName.StartsWith($prov) })
  if ($provCands.Count -gt 0) { $cands = $provCands }
  $cands = @($cands | Sort-Object @{Expression={ if ($_.name -eq $key) { 0 } else { 1 } }}, @{Expression={ $_.name.Length }}, @{Expression={ if ($_.level -eq 'city') {0} elseif ($_.level -eq 'district') {1} else {2} }})
  return $cands[0]
}

$dataJs = Get-Content (Join-Path $dir "data.js") -Raw -Encoding UTF8
$cityMatches = [regex]::Matches($dataJs, 'name:\s*"([^"]+)"\s*,\s*province:\s*"([^"]+)"')
Write-Output ("cities parsed from data.js: " + $cityMatches.Count)

$coords = @{}
$report = @()
$missing = 0
foreach ($m in $cityMatches) {
  $cname = $m.Groups[1].Value
  $cprov = $m.Groups[2].Value
  $area = Resolve-City $cname $cprov
  $ok = ($null -ne $area -and $null -ne $area.lng)
  if ($ok) {
    $coords[$cname] = [pscustomobject]@{ lng=$area.lng; lat=$area.lat; area=$area.name }
  } else {
    $missing++
  }
  $report += [pscustomobject]@{
    city = $cname
    prov = $cprov
    area = $(if ($area) { $area.name } else { "-" })
    level = $(if ($area) { $area.level } else { "-" })
    ok = $ok
  }
}

# —— JSON 序列化 ——
function To-Json($obj) {
  if ($null -eq $obj) { return "null" }
  if ($obj -is [bool]) { return $obj.ToString().ToLowerInvariant() }
  if ($obj -is [string]) { return '"' + $obj.Replace('\', '\\').Replace('"', '\"') + '"' }
  if ($obj -is [double] -or $obj -is [single]) { return $obj.ToString([System.Globalization.CultureInfo]::InvariantCulture) }
  if ($obj -is [int] -or $obj -is [long] -or $obj -is [decimal]) { return $obj.ToString([System.Globalization.CultureInfo]::InvariantCulture) }
  if ($obj -is [System.Collections.IDictionary]) {
    $items = @()
    foreach ($k in $obj.Keys) { $items += (To-Json ([string]$k)) + ":" + (To-Json $obj[$k]) }
    return "{" + ($items -join ",") + "}"
  }
  if ($obj -is [System.Collections.IEnumerable]) {
    $items = @()
    foreach ($e in $obj) { $items += (To-Json $e) }
    return "[" + ($items -join ",") + "]"
  }
  $props = @()
  foreach ($p in $obj.PSObject.Properties) {
    $props += (To-Json ([string]$p.Name)) + ":" + (To-Json $p.Value)
  }
  return "{" + ($props -join ",") + "}"
}

$depJson = To-Json $tree
$coordJson = To-Json $coords
$js = "window.DEPARTURES = " + $depJson + ";" + [Environment]::NewLine +
      "window.CITY_COORDS = " + $coordJson + ";" + [Environment]::NewLine
[System.IO.File]::WriteAllText((Join-Path $dir "geo.js"), $js, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("geo.js written: " + (Get-Item (Join-Path $dir "geo.js")).Length + " bytes")
Write-Output ("coords matched: " + ($coords.Count) + " / missing: " + $missing)

Write-Output "---- REPORT ----"
$report | ForEach-Object {
  $mark = if ($_.ok) { "OK " } else { "MISS" }
  Write-Output ($mark + " " + $_.city + " [" + $_.prov + "] -> " + $_.area + " (" + $_.level + ")")
}
