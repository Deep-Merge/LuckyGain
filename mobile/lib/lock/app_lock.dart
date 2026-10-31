import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

const _iterations = 40000;
const _saltKey = 'luckygain.lock.salt';
const _hashKey = 'luckygain.lock.hash';
const _bioKey = 'luckygain.lock.biometric';

/// Phone lock. The password never goes into the ledger backup.
class AppLock extends ChangeNotifier {
  AppLock({FlutterSecureStorage? storage, LocalAuthentication? auth})
    : _storage = storage ?? const FlutterSecureStorage(),
      _auth = auth ?? LocalAuthentication();

  final FlutterSecureStorage _storage;
  final LocalAuthentication _auth;

  Uint8List? _salt;
  Uint8List? _hash;

  var hasPassword = false;
  var biometricEnabled = false;
  var biometricAvailable = false;
  var unlocked = true;

  /// Set while a system sheet (file picker, share, fingerprint) is open.
  var suppressLock = false;

  Future<void> load() async {
    try {
      final saltText = await _storage.read(key: _saltKey);
      final hashText = await _storage.read(key: _hashKey);
      if (saltText != null && hashText != null) {
        _salt = base64Decode(saltText);
        _hash = base64Decode(hashText);
        hasPassword = true;
        unlocked = false;
        biometricEnabled = await _storage.read(key: _bioKey) == '1';
      }
    } catch (_) {
      hasPassword = false;
      unlocked = true;
    }
    try {
      final supported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      final kinds = await _auth.getAvailableBiometrics();
      biometricAvailable = supported || canCheck || kinds.isNotEmpty;
    } catch (_) {
      biometricAvailable = true;
    }
    notifyListeners();
  }

  void lock() {
    if (suppressLock || !hasPassword || !unlocked) return;
    unlocked = false;
    notifyListeners();
  }

  void markUnlocked() {
    if (unlocked) return;
    unlocked = true;
    notifyListeners();
  }

  Future<bool> matches(String password) async {
    final salt = _salt;
    final expected = _hash;
    if (salt == null || expected == null) return false;
    final actual = await compute(_deriveKey, (password, salt, _iterations));
    return _fixedEqual(actual, expected);
  }

  Future<bool> unlockWithPassword(String password) async {
    final ok = await matches(password);
    if (!ok) return false;
    unlocked = true;
    notifyListeners();
    return true;
  }

  Future<void> setPassword(String password) async {
    final random = Random.secure();
    final salt = Uint8List.fromList(
      List<int>.generate(16, (_) => random.nextInt(256)),
    );
    final hash = await compute(_deriveKey, (password, salt, _iterations));
    await _storage.write(key: _saltKey, value: base64Encode(salt));
    await _storage.write(key: _hashKey, value: base64Encode(hash));
    _salt = salt;
    _hash = hash;
    hasPassword = true;
    unlocked = true;
    notifyListeners();
  }

  Future<bool> changePassword(String current, String next) async {
    if (!await matches(current)) return false;
    await setPassword(next);
    return true;
  }

  Future<bool> clearPassword(String current) async {
    if (!await matches(current)) return false;
    await _storage.delete(key: _saltKey);
    await _storage.delete(key: _hashKey);
    await _storage.delete(key: _bioKey);
    _salt = null;
    _hash = null;
    hasPassword = false;
    biometricEnabled = false;
    unlocked = true;
    notifyListeners();
    return true;
  }

  Future<String?> enableFingerprint() async {
    suppressLock = true;
    try {
      final ok = await _auth.authenticate(
        localizedReason: 'Confirm your fingerprint for LuckyGain',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
      if (!ok) return null;
    } on LocalAuthException catch (error) {
      if (error.code == LocalAuthExceptionCode.noBiometricsEnrolled) {
        return 'Add a fingerprint in the phone settings, then turn this on.';
      }
      if (error.code == LocalAuthExceptionCode.noBiometricHardware) {
        biometricAvailable = false;
        notifyListeners();
        return 'This phone has no fingerprint reader.';
      }
      return 'The fingerprint prompt could not open.';
    } finally {
      suppressLock = false;
    }
    await _storage.write(key: _bioKey, value: '1');
    biometricEnabled = true;
    biometricAvailable = true;
    notifyListeners();
    return null;
  }

  Future<void> disableFingerprint() async {
    await _storage.delete(key: _bioKey);
    biometricEnabled = false;
    notifyListeners();
  }

  Future<bool> confirmFingerprint(String reason) async {
    suppressLock = true;
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } on LocalAuthException {
      return false;
    } finally {
      suppressLock = false;
    }
  }
}

Uint8List _deriveKey((String, Uint8List, int) args) {
  final (password, salt, iterations) = args;
  final hmac = Hmac(sha256, utf8.encode(password));
  var block = hmac.convert([...salt, 0, 0, 0, 1]).bytes;
  final mixed = Uint8List.fromList(block);
  for (var i = 1; i < iterations; i++) {
    block = hmac.convert(block).bytes;
    for (var j = 0; j < mixed.length; j++) {
      mixed[j] ^= block[j];
    }
  }
  return mixed;
}

bool _fixedEqual(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}
