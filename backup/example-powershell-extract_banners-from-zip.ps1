$basePath = '.\package\items\master\sitecore\content\Mijn Essent\SBS\Banners'
if (-not (Test-Path $basePath)) {
    Write-Host "Please run this script from the acctestbnnrs-26-3-2026 folder."
    exit
}

Write-Host "Caching media library files..."
$mediaCache = @{}
if (Test-Path '.\package\items\master\sitecore\media library') {
    $mediaFiles = Get-ChildItem -Path '.\package\items\master\sitecore\media library' -Filter 'xml' -Recurse -ErrorAction SilentlyContinue
    foreach ($mFile in $mediaFiles) {
        $guid = $mFile.Directory.Parent.Parent.Name
        if ($guid -match '^{.*}$') {
            if (-not $mediaCache.ContainsKey($guid)) {
                $mediaCache[$guid] = @{}
            }
            $lang = $mFile.Directory.Parent.Name
            $mediaCache[$guid][$lang] = $mFile.FullName
        }
    }
}
Write-Host "Cached $($mediaCache.Count) media items."

$files = Get-ChildItem -Path $basePath -Filter 'xml' -Recurse
$results = @()
foreach ($file in $files) {
    try {
        [xml]$xml = Get-Content -Raw $file.FullName -Encoding UTF8
        if ($xml.item.template -eq 'banner') {
            # Handle empty basePath resolution
            $resolvedBase = (Resolve-Path $basePath).Path
            if (-not $file.FullName.StartsWith($resolvedBase)) { continue }
            
            $relPath = $file.FullName.Substring($resolvedBase.Length).Replace('\xml', '')
            $parts = $relPath -split '\\'
            $baseFolder = if ($parts.Length -gt 1) { $parts[1] } else { '' }
            
            $subFolder = ""
            if ($parts.Length -gt 3) {
                $subFolder = $parts[2]
            }
            
            $title = ""; $subtitle = ""; $campaignId = ""; $created = ""; $updated = ""; $heroImage = ""
            $appTitle = ""; $appSubtitle = ""; $appImage = ""; $appImageAlt = ""; $appImageGuid = ""
            $ctas = @()
            
            foreach ($field in $xml.item.fields.field) {
                if ($field.key -eq 'title') { $title = $field.content }
                elseif ($field.key -eq 'subtitle') { $subtitle = $field.content }
                elseif ($field.key -eq 'campaignid') { $campaignId = $field.content }
                elseif ($field.key -eq '__created') { $created = $field.content }
                elseif ($field.key -eq '__updated') { $updated = $field.content }
                elseif ($field.key -eq 'appbannertitle') { $appTitle = $field.content }
                elseif ($field.key -eq 'appbannersubtitle') { $appSubtitle = $field.content }
                elseif ($field.key -eq 'heroimage' -or $field.key -eq 'background' -or $field.key -eq 'contentimage') {
                    if (-not $heroImage -and $field.content -match 'mediaid="({[^}]+})"') {
                        $rawGuid = $matches[1]
                        $cleanGuid = $rawGuid.Replace('{','').Replace('}','').Replace('-','')
                        $heroImage = "$cleanGuid.ashx"
                    }
                }
                elseif ($field.key -eq 'appbannerimage') {
                    if ($field.content -match 'mediaid="({[^}]+})"') {
                        $rawGuid = $matches[1]
                        $appImageGuid = $rawGuid
                        $cleanGuid = $rawGuid.Replace('{','').Replace('}','').Replace('-','')
                        $appImage = "$cleanGuid.ashx"
                    }
                    if ([string]$field.content -match '(?is)alt="([^"]+)"') {
                        $appImageAlt = $matches[1].Replace("`n", " ").Replace("`r", "").Trim()
                    }
                }
                elseif ($field.key -match 'calltoaction') {
                    if ($field.content -match '^<link ') {
                        try {
                            [xml]$linkXml = $field.content
                            if ($linkXml.link) {
                                $lText = if ($linkXml.link.text) { $linkXml.link.text } else { $linkXml.link.title }
                                $lType = $linkXml.link.linktype
                                $lUrl = ""
                                if ($lType -eq 'external') { $lUrl = $linkXml.link.url }
                                elseif ($lType -eq 'internal') { $lUrl = "Sitecore ID: " + $linkXml.link.id }
                                elseif ($lType -eq 'media') { $lUrl = "Media ID: " + $linkXml.link.id }
                                else { $lUrl = $linkXml.link.url }
                                
                                if ($lText -or $lUrl) {
                                    $ctas += [PSCustomObject]@{ Key = $field.key; Text = $lText; Url = $lUrl; Type = $lType }
                                }
                            }
                        } catch { }
                    }
                }
            }

            if (-not $appImageAlt -and $appImageGuid -and $mediaCache.ContainsKey($appImageGuid)) {
                $mDict = $mediaCache[$appImageGuid]
                $bLang = $xml.item.language
                $mPath = ""
                if ($mDict.ContainsKey($bLang)) {
                    $mPath = $mDict[$bLang]
                } elseif ($mDict.Count -gt 0) {
                    $mPath = ($mDict.Values | Select-Object -First 1)
                }
                
                if ($mPath -and (Test-Path $mPath)) {
                    try {
                        [xml]$mXml = Get-Content -Raw $mPath -Encoding UTF8
                        foreach ($mField in $mXml.item.fields.field) {
                            if ($mField.key -eq 'alt') {
                                if ($mField.content) {
                                    $appImageAlt = $mField.content.Trim()
                                }
                                break
                            }
                        }
                    } catch { }
                }
            }

            $results += [PSCustomObject]@{
                Id = $xml.item.id
                Name = $xml.item.name
                Language = $xml.item.language
                Path = $relPath
                BaseFolder = $baseFolder
                SubFolder = $subFolder
                Title = $title
                Subtitle = $subtitle
                CampaignId = $campaignId
                Created = $created
                Updated = $updated
                HeroImage = $heroImage
                AppTitle = $appTitle
                AppSubtitle = $appSubtitle
                AppImage = $appImage
                AppImageAlt = $appImageAlt
                CTAs = $ctas
            }
        }
    } catch { 
        Write-Warning "Failed to parse $($file.FullName)"
    }
}

$outputJson = '.\banners.json'
$outputJs = '.\banners_data.js'

Write-Host "Found $($results.Count) banners. Saving to $outputJson..."
$results | ConvertTo-Json -Depth 5 | Set-Content $outputJson -Encoding UTF8

Write-Host "Generating $outputJs..."
Set-Content -Path $outputJs -Value ("const BannersData = " + (Get-Content -Raw $outputJson) + ";") -Encoding UTF8

Write-Host "Done!"
