String formatYuan(int cents) {
  final negative = cents < 0;
  final abs = cents.abs();
  final whole = abs ~/ 100;
  final frac = (abs % 100).toString().padLeft(2, '0');
  final grouped = _group(whole);
  return '${negative ? '-' : ''}¥$grouped.$frac';
}

String formatDotDate(String iso) {
  final parts = iso.length >= 10 ? iso.substring(0, 10).split('-') : const <String>[];
  if (parts.length != 3) return iso;
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  final d = int.tryParse(parts[2]);
  if (y == null || m == null || d == null) return iso;
  return '$y.$m.$d';
}

String whomLabel(String raw) {
  switch (raw) {
    case 'me':
      return 'Me';
    case 'jackie':
      return 'Jackie';
    case 'family':
      return 'Family';
    case 'chuck':
      return 'Chuck';
    case 'self':
      return 'Self';
    default:
      if (raw.isEmpty) return '—';
      return raw[0].toUpperCase() + raw.substring(1);
  }
}

String _group(int value) {
  final text = value.toString();
  final buf = StringBuffer();
  for (var i = 0; i < text.length; i++) {
    if (i > 0 && (text.length - i) % 3 == 0) buf.write(',');
    buf.write(text[i]);
  }
  return buf.toString();
}
