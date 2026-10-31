import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

const syncVersion = 1;
const maxFrameBytes = 12 * 1024 * 1024;

class FrameDecoder {
  var _buffer = Uint8List(0);

  List<Map<String, dynamic>> push(Uint8List chunk) {
    if (chunk.isEmpty) return const [];
    final next = Uint8List(_buffer.length + chunk.length);
    next.setRange(0, _buffer.length, _buffer);
    next.setRange(_buffer.length, next.length, chunk);
    _buffer = next;
    final messages = <Map<String, dynamic>>[];
    while (_buffer.length >= 4) {
      final length = ByteData.sublistView(_buffer).getUint32(0);
      if (length > maxFrameBytes) {
        _buffer = Uint8List(0);
        throw const FormatException('That sync message is too large');
      }
      if (_buffer.length < 4 + length) break;
      final body = utf8.decode(_buffer.sublist(4, 4 + length));
      _buffer = _buffer.sublist(4 + length);
      final decoded = jsonDecode(body);
      if (decoded is Map) {
        messages.add(Map<String, dynamic>.from(decoded));
      }
    }
    return messages;
  }
}

Uint8List encodeMessage(Map<String, dynamic> message) {
  final body = utf8.encode(jsonEncode(message));
  if (body.length > maxFrameBytes) {
    throw const FormatException('That sync message is too large');
  }
  final out = Uint8List(4 + body.length);
  ByteData.sublistView(out).setUint32(0, body.length);
  out.setRange(4, out.length, body);
  return out;
}

class MessageInbox {
  final _items = <Map<String, dynamic>>[];
  final _waiters = <Completer<Map<String, dynamic>>>[];
  Object? _failed;

  void push(Map<String, dynamic> message) {
    if (_waiters.isNotEmpty) {
      _waiters.removeAt(0).complete(message);
    } else {
      _items.add(message);
    }
  }

  void fail(Object error) {
    if (_failed != null) return;
    _failed = error;
    final waiters = List<Completer<Map<String, dynamic>>>.of(_waiters);
    _waiters.clear();
    for (final waiter in waiters) {
      waiter.completeError(error);
    }
  }

  void clear() {
    _items.clear();
  }

  Future<Map<String, dynamic>> next() {
    if (_items.isNotEmpty) return Future.value(_items.removeAt(0));
    final failed = _failed;
    if (failed != null) return Future.error(failed);
    final waiter = Completer<Map<String, dynamic>>();
    _waiters.add(waiter);
    return waiter.future;
  }
}
