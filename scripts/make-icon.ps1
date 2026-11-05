Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = [System.Drawing.Bitmap]::new($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

$body = New-RoundedPath 64 64 896 896 196

$rect = [System.Drawing.Rectangle]::new(64, 64, 896, 896)
$fill = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 250, 238, 178),
    [System.Drawing.Color]::FromArgb(255, 235, 207, 108),
    90
)
$g.FillPath($fill, $body)

$border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(70, 132, 104, 42), 7)
$g.DrawPath($border, $body)

# highlighter swipe
$hlPath = New-RoundedPath 236 452 552 96 48
$hl = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(110, 255, 112, 84))
$g.FillPath($hl, $hlPath)

# text lines
$lineColor = [System.Drawing.Color]::FromArgb(200, 92, 72, 26)
$pen = [System.Drawing.Pen]::new($lineColor, 54)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($pen, 268, 372, 756, 372)
$g.DrawLine($pen, 268, 500, 700, 500)
$g.DrawLine($pen, 268, 628, 610, 628)

$out = Join-Path $PSScriptRoot "..\assets\icon-source.png"
$dir = Split-Path $out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "saved $out"
