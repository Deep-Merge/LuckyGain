import '../db/ledger_store.dart';
import 'wifi_sync.dart';

class WifiSession {
  WifiSession._();

  static final WifiSession instance = WifiSession._();

  WifiPhoneLink? _link;

  WifiPhoneLink attach(LedgerStore store) {
    return _link ??= WifiPhoneLink(store);
  }

  bool get connected => _link?.connected == true;

  Future<void> openOnComputer(LedgerStore store, String url) async {
    final link = attach(store);
    if (!link.connected) {
      final saved = await loadWifiSync();
      final host = wifiHost(saved.host);
      final code = wifiCode(saved.code);
      if (host == null || code == null) {
        throw const FormatException(
          'Connect on Ledger first. LuckyGain must stay open on the computer.',
        );
      }
      await link.open(host, code);
    }
    await link.sendOpen(url);
  }
}
