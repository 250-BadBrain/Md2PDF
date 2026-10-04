"""Create an original CC0 test font; deliberately box-shaped, never a UI default."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

codes = list(range(32, 127)) + [ord(c) for c in '中文测试第一页第二页正文链接']
codes = sorted(set(codes))
names = {code: f'u{code:04X}' for code in codes}
order = ['.notdef'] + list(names.values())
builder = FontBuilder(1000, isTTF=True)
builder.setupGlyphOrder(order)
builder.setupCharacterMap(names)
glyphs = {}
for name in order:
    pen = TTGlyphPen(None)
    if name != names[32]:
        pen.moveTo((100, 100))
        pen.lineTo((500, 100))
        pen.lineTo((500, 700))
        pen.lineTo((100, 700))
        pen.closePath()
    glyphs[name] = pen.glyph()
builder.setupGlyf(glyphs)
builder.setupHorizontalMetrics({name: (600, 100) for name in order})
builder.setupHorizontalHeader(ascent=800, descent=-200)
builder.setupNameTable({'familyName': 'Md2PDF Test', 'styleName': 'Regular', 'uniqueFontIdentifier': 'Md2PDFTest-1', 'fullName': 'Md2PDF Test', 'psName': 'Md2PDFTest'})
builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, fsType=0)
builder.setupPost()
builder.setupMaxp()
builder.save(Path(__file__).with_name('test.ttf'))
