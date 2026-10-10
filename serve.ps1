param([int]$Port = 8080)
$root = $PSScriptRoot

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
  '.woff' = 'font/woff'
}

function Send-Response($client, $statusCode, $statusText, $contentType, $bodyBytes) {
  $stream = $client.GetStream()
  $header = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($bodyBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  $stream.Write($bodyBytes, 0, $bodyBytes.Length)
  $stream.Flush()
  $stream.Close()
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "ConnectKart server running at http://localhost:$Port/" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()

    # Read request (up to 4KB header)
    $buf = New-Object byte[] 4096
    $n   = $stream.Read($buf, 0, $buf.Length)
    $req = [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)

    # Parse the first line: GET /path HTTP/1.1
    $firstLine = ($req -split "`r`n")[0]
    $parts     = $firstLine -split ' '
    $urlPath   = if ($parts.Count -ge 2) { $parts[1] } else { '/' }

    # Strip query string
    $urlPath = ($urlPath -split '\?')[0]
    if ($urlPath -eq '/') { $urlPath = '/index.html' }

    $filePath = Join-Path $root ($urlPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar))

    if (Test-Path $filePath -PathType Leaf) {
      $ext      = [System.IO.Path]::GetExtension($filePath).ToLower()
      $ct       = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bodyBytes = [System.IO.File]::ReadAllBytes($filePath)
      Send-Response $client 200 'OK' $ct $bodyBytes
    } else {
      $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
      Send-Response $client 404 'Not Found' 'text/plain; charset=utf-8' $bodyBytes
    }

    $client.Close()
  }
} finally {
  $listener.Stop()
}
