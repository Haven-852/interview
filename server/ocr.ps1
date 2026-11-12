param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [Parameter(Mandatory = $true)][string]$OutPath
)
$ErrorActionPreference = "Stop"

function Fail([string]$message) {
  [System.IO.File]::WriteAllText($OutPath, ("ERROR " + $message), [System.Text.UTF8Encoding]::new($false))
  exit 1
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  Add-Type -AssemblyName System.Drawing
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

  $asTask = $null
  foreach ($method in [System.WindowsRuntimeSystemExtensions].GetMethods()) {
    if ($method.Name -ne "AsTask") { continue }
    $params = $method.GetParameters()
    if ($params.Count -ne 1) { continue }
    if ($params[0].ParameterType.Name.StartsWith("IAsyncOperation")) { $asTask = $method; break }
  }
  if (-not $asTask) { Fail "NO_ASYNC" }

  function Await($op, $type) {
    $method = $script:asTask.MakeGenericMethod($type)
    $task = $method.Invoke($null, @(,$op))
    $task.Wait(-1) | Out-Null
    return $task.Result
  }

  $target = $ImagePath
  $scaled = "$ImagePath.scaled.png"
  $source = [System.Drawing.Image]::FromFile($ImagePath)
  try {
    $limit = 2000
    if ($source.Width -gt $limit -or $source.Height -gt $limit) {
      $scale = $limit / [Math]::Max($source.Width, $source.Height)
      $nw = [Math]::Max(1, [int]($source.Width * $scale))
      $nh = [Math]::Max(1, [int]($source.Height * $scale))
      $resized = New-Object System.Drawing.Bitmap $nw, $nh
      $graphics = [System.Drawing.Graphics]::FromImage($resized)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($source, 0, 0, $nw, $nh)
      $resized.Save($scaled, [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $resized.Dispose()
      $target = $scaled
    }
  } finally {
    $source.Dispose()
  }

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($target)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  if ($bitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8) {
    $bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)
  }
  $lang = [Windows.Globalization.Language]::new("zh-Hans-CN")
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if (-not $engine) { Fail "NO_ENGINE" }
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $sep = [char]9
  $builder = New-Object System.Text.StringBuilder
  foreach ($line in $result.Lines) {
    foreach ($word in $line.Words) {
      $rect = $word.BoundingRect
      [void]$builder.Append($word.Text)
      [void]$builder.Append($sep)
      [void]$builder.Append([int]$rect.X)
      [void]$builder.Append($sep)
      [void]$builder.AppendLine([string][int]$rect.Width)
    }
    [void]$builder.AppendLine()
  }
  [System.IO.File]::WriteAllText($OutPath, $builder.ToString(), [System.Text.UTF8Encoding]::new($false))
} catch {
  Fail $_.Exception.Message
}
