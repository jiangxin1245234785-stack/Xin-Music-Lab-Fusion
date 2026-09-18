param([string]$OutputDirectory = "$PSScriptRoot/assets")
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(256,256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = 'AntiAlias'
$graphics.TextRenderingHint = 'AntiAliasGridFit'
$shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
foreach ($arc in @(@(8,8,90,90,180,90),@(158,8,90,90,270,90),@(158,158,90,90,0,90),@(8,158,90,90,90,90))) { $shape.AddArc($arc[0],$arc[1],$arc[2],$arc[3],$arc[4],$arc[5]) }
$shape.CloseFigure()
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(0,0,256,256),[System.Drawing.ColorTranslator]::FromHtml('#8fe7ce'),[System.Drawing.ColorTranslator]::FromHtml('#e36fae'),45)
$blend = [System.Drawing.Drawing2D.ColorBlend]::new(3)
$blend.Colors = @([System.Drawing.ColorTranslator]::FromHtml('#8fe7ce'),[System.Drawing.ColorTranslator]::FromHtml('#9d86ff'),[System.Drawing.ColorTranslator]::FromHtml('#e36fae'))
$blend.Positions = @(0,0.55,1)
$brush.InterpolationColors = $blend
$graphics.FillPath($brush,$shape)
$font = [System.Drawing.Font]::new('Segoe UI',67,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0c0d12'))
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = 'Center'; $format.LineAlignment = 'Center'
$graphics.DrawString('XLD',$font,$ink,[System.Drawing.RectangleF]::new(0,0,256,251),$format)
$bitmap.Save((Join-Path $OutputDirectory 'xld.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$chunks = @()
foreach ($size in @(16,24,32,48,64,128,256)) {
 $scaled = [System.Drawing.Bitmap]::new($bitmap,$size,$size)
 $stream = [System.IO.MemoryStream]::new()
 $scaled.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
 $chunks += ,@($size,$stream.ToArray())
 $stream.Dispose(); $scaled.Dispose()
}
$file = [System.IO.File]::Create((Join-Path $OutputDirectory 'xld.ico'))
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$chunks.Count)
$offset = 6 + 16*$chunks.Count
foreach ($chunk in $chunks) {
 $dimension = if ($chunk[0] -eq 256) {0} else {$chunk[0]}
 $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([uint16]0)
 $writer.Write([uint16]1); $writer.Write([uint16]32)
 $writer.Write([uint32]$chunk[1].Length); $writer.Write([uint32]$offset)
 $offset += $chunk[1].Length
}
foreach ($chunk in $chunks) { $writer.Write([byte[]]$chunk[1]) }
$writer.Dispose(); $file.Dispose()
$format.Dispose(); $ink.Dispose(); $font.Dispose(); $brush.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
