param(
  [Parameter(Mandatory=$true)][string]$ImagePath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [string]$FullPageOutputPath = '',
  [int]$InkThreshold = 55,
  [int]$CellWidth = 300,
  [int]$CellHeight = 160
)

Add-Type -AssemblyName System.Drawing
if (-not ('PaperCellTools' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;

public static class PaperCellTools {
  public static Bitmap Crop(Bitmap source, RectangleF sourceRect, int width, int height) {
    var target = new Bitmap(width, height);
    using (var g = Graphics.FromImage(target)) {
      g.Clear(Color.White);
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.DrawImage(source, new RectangleF(0, 0, width, height), sourceRect, GraphicsUnit.Pixel);
    }
    return target;
  }

  public static int InkScore(Bitmap cell) {
    int x0=(int)(cell.Width*0.09), x1=(int)(cell.Width*0.91);
    int y0=(int)(cell.Height*0.10), y1=(int)(cell.Height*0.90);
    long sum=0; int count=0;
    for(int y=y0;y<y1;y+=2) for(int x=x0;x<x1;x+=2) {
      var c=cell.GetPixel(x,y); sum+=(c.R*299+c.G*587+c.B*114)/1000; count++;
    }
    double mean=(double)sum/count;
    int dark=0;
    for(int y=y0;y<y1;y++) for(int x=x0;x<x1;x++) {
      var c=cell.GetPixel(x,y); int gray=(c.R*299+c.G*587+c.B*114)/1000;
      if(gray < mean-34 && gray < 155) dark++;
    }
    return dark;
  }
}
'@ -ReferencedAssemblies System.Drawing
}

$source = [System.Drawing.Bitmap]::FromFile($ImagePath)
try {
  if ($FullPageOutputPath) {
    $scale=[Math]::Min(1.0,2400.0/[Math]::Max($source.Width,$source.Height))
    $full=[PaperCellTools]::Crop($source,(New-Object System.Drawing.RectangleF(0,0,$source.Width,$source.Height)),[int][Math]::Round($source.Width*$scale),[int][Math]::Round($source.Height*$scale))
    try { $full.Save($FullPageOutputPath,[System.Drawing.Imaging.ImageFormat]::Jpeg) } finally { $full.Dispose() }
  }
  # Fixed corners measured from the supplied 4284x5712 photograph.
  # The data area excludes row/column labels and contains exactly 20x20 cells.
  $left = 270.0; $top = 1622.0; $right = 3255.0; $bottom = 3754.0
  $cellW = ($right-$left)/20.0; $cellH = ($bottom-$top)/20.0
  $features = @()
  for($row=1;$row -le 20;$row++) {
    for($column=1;$column -le 20;$column++) {
      $rect = New-Object System.Drawing.RectangleF(
        [single]($left+($column-1)*$cellW), [single]($top+($row-1)*$cellH),
        [single]$cellW, [single]$cellH)
      $cell = [PaperCellTools]::Crop($source,$rect,$CellWidth,$CellHeight)
      try { $score=[PaperCellTools]::InkScore($cell) } finally { $cell.Dispose() }
      $features += [pscustomobject]@{row=$row;column=$column;ink_score=$score;selected=($score -ge $InkThreshold)}
    }
  }

  $selected=@($features|Where-Object selected|Sort-Object row,column)
  # Keep handwriting large enough for OCR while staying below the 18 MP API guard.
  $tileW=450; $tileH=240; $sheetCols=4; $sheetRows=[Math]::Max(1,[Math]::Ceiling($selected.Count/$sheetCols))
  $sheet=New-Object System.Drawing.Bitmap -ArgumentList ([int]($tileW*$sheetCols)),([int]($tileH*$sheetRows))
  try {
    $g=[System.Drawing.Graphics]::FromImage($sheet)
    try {
      $g.Clear([System.Drawing.Color]::White)
      for($index=0;$index -lt $selected.Count;$index++) {
        $item=$selected[$index]; $tx=($index%$sheetCols)*$tileW; $ty=[Math]::Floor($index/$sheetCols)*$tileH
        $rect=New-Object System.Drawing.RectangleF(
          [single]($left+($item.column-1)*$cellW),[single]($top+($item.row-1)*$cellH),
          [single]$cellW,[single]$cellH)
        $cell=[PaperCellTools]::Crop($source,$rect,$tileW-30,$tileH-30)
        try { $g.DrawImage($cell,$tx+15,$ty+15,$tileW-30,$tileH-30) } finally { $cell.Dispose() }
      }
    } finally { $g.Dispose() }
    $sheet.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Jpeg)
  } finally { $sheet.Dispose() }

  [pscustomobject]@{
    threshold=$InkThreshold; selected_count=$selected.Count; sheet_width=$tileW*$sheetCols;
    sheet_height=$tileH*$sheetRows; tile_width=$tileW; tile_height=$tileH;
    selected=$selected; features=$features
  } | ConvertTo-Json -Depth 5 -Compress
} finally { $source.Dispose() }
