$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$electronAssets = Join-Path $root "electron\assets"
$publicIcons = Join-Path $root "public\icons"
New-Item -ItemType Directory -Force -Path $electronAssets | Out-Null
New-Item -ItemType Directory -Force -Path $publicIcons | Out-Null

function S([double]$value, [int]$size) {
  return [single]($value * $size / 512.0)
}

function New-RoundedRectPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-AppIcon([int]$size, [string]$pngPath) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $red = [System.Drawing.Color]::FromArgb(255, 166, 64, 38)
  $darkRed = [System.Drawing.Color]::FromArgb(255, 126, 46, 28)
  $white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

  $bgPath = New-RoundedRectPath (S 24 $size) (S 24 $size) (S 464 $size) (S 464 $size) (S 116 $size)
  $bgBrush = New-Object System.Drawing.SolidBrush $red
  $graphics.FillPath($bgBrush, $bgPath)

  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(36, 40, 20, 12))
  $shadowPoints = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (S 110 $size), (S 222 $size)),
    (New-Object System.Drawing.PointF (S 256 $size), (S 142 $size)),
    (New-Object System.Drawing.PointF (S 402 $size), (S 222 $size)),
    (New-Object System.Drawing.PointF (S 256 $size), (S 302 $size))
  )
  $graphics.FillPolygon($shadowBrush, $shadowPoints)

  $capBrush = New-Object System.Drawing.SolidBrush $white
  $capPoints = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (S 96 $size), (S 202 $size)),
    (New-Object System.Drawing.PointF (S 256 $size), (S 116 $size)),
    (New-Object System.Drawing.PointF (S 416 $size), (S 202 $size)),
    (New-Object System.Drawing.PointF (S 256 $size), (S 288 $size))
  )
  $graphics.FillPolygon($capBrush, $capPoints)

  $outlinePen = New-Object System.Drawing.Pen $white, (S 34 $size)
  $outlinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $outlinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $outlinePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($outlinePen, [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (S 150 $size), (S 252 $size)),
    (New-Object System.Drawing.PointF (S 150 $size), (S 326 $size)),
    (New-Object System.Drawing.PointF (S 196 $size), (S 352 $size)),
    (New-Object System.Drawing.PointF (S 256 $size), (S 362 $size)),
    (New-Object System.Drawing.PointF (S 316 $size), (S 352 $size)),
    (New-Object System.Drawing.PointF (S 362 $size), (S 326 $size)),
    (New-Object System.Drawing.PointF (S 362 $size), (S 252 $size))
  ))

  $tasselPen = New-Object System.Drawing.Pen $white, (S 24 $size)
  $tasselPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tasselPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($tasselPen, (S 346 $size), (S 236 $size), (S 346 $size), (S 336 $size))

  $playBrush = New-Object System.Drawing.SolidBrush $darkRed
  $playPoints = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (S 224 $size), (S 210 $size)),
    (New-Object System.Drawing.PointF (S 224 $size), (S 322 $size)),
    (New-Object System.Drawing.PointF (S 322 $size), (S 266 $size))
  )
  $graphics.FillPolygon($playBrush, $playPoints)

  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $playBrush.Dispose()
  $tasselPen.Dispose()
  $outlinePen.Dispose()
  $capBrush.Dispose()
  $shadowBrush.Dispose()
  $bgBrush.Dispose()
  $bgPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Draw-AppIcon 512 (Join-Path $electronAssets "icon.png")
Draw-AppIcon 512 (Join-Path $publicIcons "app-icon-512.png")
Draw-AppIcon 192 (Join-Path $publicIcons "app-icon-192.png")

$icoPng = Join-Path $electronAssets "icon-256.png"
Draw-AppIcon 256 $icoPng
$icoBitmap = New-Object System.Drawing.Bitmap $icoPng
$hIcon = $icoBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$stream = [System.IO.File]::Create((Join-Path $electronAssets "icon.ico"))
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$icoBitmap.Dispose()

Write-Host "Generated native app icons in $electronAssets and $publicIcons"
