import 'package:flutter_test/flutter_test.dart';
import 'package:luckygain_mobile/money.dart';

void main() {
  test('yuan amounts keep cents and grouping', () {
    expect(formatYuan(0), '¥0.00');
    expect(formatYuan(200000), '¥2,000.00');
    expect(formatYuan(-343450), '-¥3,434.50');
  });
}
