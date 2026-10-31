import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../db/ledger_store.dart';
import '../lock/app_lock.dart';
import '../money.dart';
import '../sync/wifi_session.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_motion.dart';
import '../widgets/lg_widgets.dart';

const _screenshotChannel = MethodChannel('luckygain/screenshot');
const _filesChannel = MethodChannel('luckygain/files');

const goodCategories = <({String id, String label, IconData icon})>[
  (id: 'clothes', label: 'Clothes', icon: Icons.checkroom_outlined),
  (id: 'shoes', label: 'Shoes', icon: Icons.snowshoeing_outlined),
  (id: 'socks', label: 'Socks / Underwear', icon: Icons.layers_outlined),
  (id: 'bags', label: 'Bags', icon: Icons.work_outline),
  (id: 'sports', label: 'Sports gear', icon: Icons.fitness_center_outlined),
  (id: 'beauty', label: 'Beauty', icon: Icons.spa_outlined),
  (
    id: 'health',
    label: 'Health / Supplement',
    icon: Icons.monitor_heart_outlined,
  ),
  (id: 'smoking', label: 'Smoking', icon: Icons.smoking_rooms_outlined),
  (id: 'food', label: 'Food / Dining', icon: Icons.restaurant_outlined),
  (id: 'electronics', label: 'Electronics', icon: Icons.smartphone_outlined),
  (id: 'home', label: 'Home', icon: Icons.home_outlined),
  (id: 'cash_gift', label: 'Cash / Gift', icon: Icons.card_giftcard_outlined),
  (id: 'other', label: 'Other', icon: Icons.inventory_2_outlined),
];

({String id, String label, IconData icon}) goodCategoryOf(String id) {
  for (final category in goodCategories) {
    if (category.id == id) return category;
  }
  return goodCategories.last;
}

const _outsideMarker = '[outside-wallet]';

String stripOutsideNotes(String? notes) {
  return (notes ?? '').replaceAll(_outsideMarker, '').trim();
}

String notesWithOutside(String notes, bool outside) {
  final base = notes.replaceAll(_outsideMarker, '').trim();
  if (!outside) return base;
  return base.isEmpty ? _outsideMarker : '$base\n$_outsideMarker';
}

Uint8List? goodPhotoBytes(String? dataUrl) {
  if (dataUrl == null) return null;
  final comma = dataUrl.indexOf(',');
  if (comma < 0 || comma >= dataUrl.length - 1) return null;
  try {
    return base64Decode(dataUrl.substring(comma + 1));
  } catch (_) {
    return null;
  }
}

class GoodPhoto extends StatelessWidget {
  const GoodPhoto({
    super.key,
    required this.dataUrl,
    this.size = 56,
    this.radius = 14,
    this.expand = false,
  });

  final String? dataUrl;
  final double size;
  final double radius;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final bytes = goodPhotoBytes(dataUrl);
    final child = bytes == null
        ? const Icon(Icons.image_outlined, color: Lg.muted, size: 22)
        : Image.memory(
            bytes,
            fit: BoxFit.cover,
            gaplessPlayback: true,
            cacheWidth: expand ? 1080 : (size * 3).round(),
          );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: ColoredBox(
        color: Lg.ivoryDeep,
        child: SizedBox(
          width: expand ? double.infinity : size,
          height: expand ? 220 : size,
          child: bytes == null ? Center(child: child) : child,
        ),
      ),
    );
  }
}

class GoodDetailPage extends StatefulWidget {
  const GoodDetailPage({
    super.key,
    required this.store,
    required this.lock,
    required this.good,
  });

  final LedgerStore store;
  final AppLock lock;
  final GoodRow good;

  @override
  State<GoodDetailPage> createState() => _GoodDetailPageState();
}

class _GoodDetailPageState extends State<GoodDetailPage> {
  late final TextEditingController _title;
  late final TextEditingController _price;
  late final TextEditingController _called;
  late final TextEditingController _url;
  late final TextEditingController _comment;
  late String _date;
  late String _whom;
  late String _category;
  late bool _outside;
  late bool _enabled;
  String? _image;
  var _busy = false;
  var _shotBusy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final good = widget.good;
    _title = TextEditingController(text: good.title);
    _price = TextEditingController(text: _yuan(good.priceCents));
    _called = TextEditingController(
      text: good.calledPriceCents == null ? '' : _yuan(good.calledPriceCents!),
    );
    _url = TextEditingController(text: good.url ?? '');
    _comment = TextEditingController(text: good.comment ?? '');
    _date = good.purchasedOn.length >= 10
        ? good.purchasedOn.substring(0, 10)
        : good.purchasedOn;
    _whom = good.whom == 'self' ? 'me' : good.whom;
    _category = goodCategories.any((item) => item.id == good.category)
        ? good.category
        : 'other';
    _outside = good.outsideWallet;
    _enabled = good.enabled;
    _image = good.imageDataUrl;
  }

  @override
  void dispose() {
    _title.dispose();
    _price.dispose();
    _called.dispose();
    _url.dispose();
    _comment.dispose();
    super.dispose();
  }

  String _yuan(int cents) => (cents / 100).toStringAsFixed(2);

  int? _cents(String text, {required bool allowEmpty}) {
    final raw = text.trim();
    if (raw.isEmpty) return allowEmpty ? null : -1;
    final value = double.tryParse(raw);
    if (value == null || value < 0) return -1;
    return (value * 100).round();
  }

  Future<void> _pickCategory() async {
    final picked = await showGeneralDialog<String>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: const Color(0x662A2F2B),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (context, animation, secondary) {
        return _CategoryMenu(
          selected: _category,
          onPick: (id) => Navigator.pop(context, id),
        );
      },
      transitionBuilder: (context, animation, secondary, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.97, end: 1).animate(curved),
            child: child,
          ),
        );
      },
    );
    if (picked == null || !mounted) return;
    setState(() => _category = picked);
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2018),
      lastDate: DateTime(2100),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Lg.goldDark,
              onPrimary: Colors.white,
              surface: Lg.panel,
              onSurface: Lg.charcoal,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _pickPhoto(ImageSource source) async {
    widget.lock.suppressLock = true;
    try {
      final picker = ImagePicker();
      var file = await picker.pickImage(
        source: source,
        maxWidth: 1600,
        imageQuality: 82,
        preferredCameraDevice: CameraDevice.rear,
        requestFullMetadata: false,
      );
      if (file == null) {
        final lost = await picker.retrieveLostData();
        if (lost.exception != null) throw lost.exception!;
        if (!lost.isEmpty) file = lost.file;
      }
      if (file == null || !mounted) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      if (bytes.length > 2500000) {
        setState(() => _error = 'Choose a photo under 2.5 MB.');
        return;
      }
      final name = file.name.toLowerCase();
      final mime = name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
      await _acceptPhoto(bytes, mime);
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() => _error = _photoError(source, error.code));
    } finally {
      widget.lock.suppressLock = false;
    }
  }

  Future<void> _takeScreenshot() async {
    if (_shotBusy) return;
    _shotBusy = true;
    widget.lock.suppressLock = true;
    try {
      final bytes = await _screenshotChannel.invokeMethod<Uint8List>('capture');
      if (bytes == null || !mounted) return;
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      await _acceptPhoto(bytes, 'image/jpeg');
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() => _error = _shotError(error.code));
    } on MissingPluginException {
      if (!mounted) return;
      setState(() {
        _error = 'Restart the app on this phone, then tap Screen again.';
      });
    } finally {
      _shotBusy = false;
      widget.lock.suppressLock = false;
    }
  }

  Future<void> _acceptPhoto(Uint8List bytes, String mime) async {
    if (!mounted) return;
    if (bytes.length > 2500000) {
      setState(() => _error = 'Choose a photo under 2.5 MB.');
      return;
    }
    final cropped = await _openCrop(bytes);
    if (cropped == null || !mounted) return;
    if (cropped.length > 2500000) {
      setState(() => _error = 'That crop is still over 2.5 MB.');
      return;
    }
    final kept = identical(cropped, bytes);
    setState(() {
      _image = 'data:${kept ? mime : 'image/png'};base64,${base64Encode(cropped)}';
      _error = null;
    });
  }

  String _shotError(String code) {
    if (code == 'overlay') {
      return 'Allow LuckyGain to appear over other apps, then tap Screen again.';
    }
    return 'Could not take that screenshot.';
  }

  Future<void> _cropCurrent() async {
    final bytes = goodPhotoBytes(_image);
    if (bytes == null) return;
    final cropped = await _openCrop(bytes);
    if (cropped == null || !mounted) return;
    if (cropped.length > 2500000) {
      setState(() => _error = 'That crop is still over 2.5 MB.');
      return;
    }
    final mime = identical(cropped, bytes) ? _mimeOf(_image) : 'image/png';
    setState(() {
      _image = 'data:$mime;base64,${base64Encode(cropped)}';
      _error = null;
    });
  }

  String? _liveUrl() {
    var text = _url.text.trim();
    if (text.isEmpty) return null;
    if (!RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*:').hasMatch(text)) {
      text = 'https://$text';
    }
    final parsed = Uri.tryParse(text);
    if (parsed == null || !parsed.hasScheme) return null;
    return parsed.toString();
  }

  Future<void> _pasteUrl() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text?.trim() ?? '';
    if (!mounted) return;
    if (text.isEmpty) {
      setState(() => _error = 'Nothing to paste.');
      return;
    }
    _url.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
    if (_error != null) setState(() => _error = null);
  }

  Future<void> _openUrlHere() async {
    final url = _liveUrl();
    if (url == null) {
      setState(() => _error = 'Enter a product URL first.');
      return;
    }
    try {
      await _filesChannel.invokeMethod<void>('openUrl', {'url': url});
      if (_error != null && mounted) setState(() => _error = null);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not open that link on this phone.');
    }
  }

  Future<void> _openUrlOnComputer() async {
    final url = _liveUrl();
    if (url == null) {
      setState(() => _error = 'Enter a product URL first.');
      return;
    }
    try {
      await WifiSession.instance.openOnComputer(widget.store, url);
      if (!mounted) return;
      setState(() => _error = null);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is FormatException
            ? error.message
            : 'Open LuckyGain on the computer first. Stay on the same Wi-Fi.';
      });
    }
  }

  Future<Uint8List?> _openCrop(Uint8List bytes) {
    return Navigator.of(context).push<Uint8List>(
      LgPageRoute<Uint8List>(builder: (_) => _PhotoCropPage(bytes: bytes)),
    );
  }

  String _mimeOf(String? dataUrl) {
    if (dataUrl == null) return 'image/jpeg';
    final comma = dataUrl.indexOf(',');
    final head = comma < 0 ? dataUrl : dataUrl.substring(0, comma);
    if (head.contains('image/png')) return 'image/png';
    if (head.contains('image/webp')) return 'image/webp';
    return 'image/jpeg';
  }

  String _photoError(ImageSource source, String code) {
    if (code == 'camera_access_denied') {
      return 'Camera permission is needed to take a photo.';
    }
    if (code == 'photo_access_denied' || code == 'photo_access_restricted') {
      return 'Photo access is needed to choose a picture.';
    }
    if (source == ImageSource.camera) {
      return 'The camera isn’t available on this device.';
    }
    return 'Could not open that photo.';
  }

  Future<void> _zoom() async {
    final image = _image;
    if (goodPhotoBytes(image) == null) return;
    await Navigator.of(
      context,
    ).push(LgPageRoute<void>(builder: (_) => _PhotoZoom(dataUrl: image!)));
  }

  void _save() {
    final price = _cents(_price.text, allowEmpty: false);
    final called = _cents(_called.text, allowEmpty: true);
    if (_title.text.trim().isEmpty) {
      setState(() => _error = 'Title is required.');
      return;
    }
    if (price == null || price < 0) {
      setState(() => _error = 'Price must be zero or positive.');
      return;
    }
    if (called != null && called < 0) {
      setState(() => _error = 'Called price must be zero or positive.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      widget.store.saveGood(
        GoodRow(
          id: widget.good.id,
          title: _title.text.trim(),
          priceCents: price,
          purchasedOn: _date,
          whom: _whom,
          category: _category,
          url: _url.text.trim(),
          notes: notesWithOutside(
            stripOutsideNotes(widget.good.notes),
            _outside,
          ),
          imageDataUrl: _image,
          returnedOn: widget.good.returnedOn,
          enabled: _enabled,
          comment: _comment.text.trim(),
          calledPriceCents: called,
        ),
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error is FormatException
            ? error.message
            : 'Could not save this good.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Lg.ivory,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFBF6EC), Lg.ivory],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back, color: Lg.charcoal),
                  ),
                  const Text(
                    'Edit good',
                    style: TextStyle(
                      fontFamily: Lg.display,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.3,
                      height: 1.1,
                      color: Lg.charcoal,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              _DetailPhoto(dataUrl: _image, onZoom: _zoom),
              if (_image != null) ...[
                const SizedBox(height: 8),
                const Text(
                  'Tap the photo to zoom.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 12,
                    color: Lg.muted,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _PhotoIcon(
                      icon: Icons.photo_camera_outlined,
                      label: 'Camera',
                      onTap: () => _pickPhoto(ImageSource.camera),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _PhotoIcon(
                      icon: Icons.photo_outlined,
                      label: 'Library',
                      onTap: () => _pickPhoto(ImageSource.gallery),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _PhotoIcon(
                      icon: Icons.screenshot_outlined,
                      label: 'Screen',
                      onTap: _takeScreenshot,
                    ),
                  ),
                  if (_image != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: _PhotoIcon(
                        icon: Icons.crop_outlined,
                        label: 'Crop',
                        onTap: _cropCurrent,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _PhotoIcon(
                        icon: Icons.delete_outline,
                        label: 'Remove',
                        onTap: () => setState(() => _image = null),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 18),
              _Field(label: 'Title', controller: _title),
              const SizedBox(height: 14),
              _CategoryField(
                category: goodCategoryOf(_category),
                onTap: _pickCategory,
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _Field(label: 'Price (Yuan)', controller: _price),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Field(
                      label: 'Called (Yuan)',
                      controller: _called,
                      hint: 'Optional',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _TapField(
                label: 'Purchased',
                value: formatDotDate(_date),
                icon: Icons.calendar_today_outlined,
                onTap: _pickDate,
              ),
              const SizedBox(height: 14),
              const _QuietLabel('For whom'),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (final whom in const ['me', 'jackie', 'family', 'chuck'])
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: whom == 'chuck' ? 0 : 8,
                        ),
                        child: _Choice(
                          label: whomLabel(whom),
                          selected: _whom == whom,
                          onTap: () => setState(() => _whom = whom),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              _SwitchRow(
                title: 'Self · outside wallet',
                body:
                    'Still tagged to the person above. Wallet status stays flat.',
                value: _outside,
                onChanged: (value) => setState(() => _outside = value),
              ),
              const SizedBox(height: 14),
              const _QuietLabel('In the total'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _StatusChoice(
                      title: 'On',
                      caption: 'Counted',
                      selected: _enabled,
                      live: true,
                      onTap: () => setState(() => _enabled = true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _StatusChoice(
                      title: 'Off',
                      caption: 'Listed only',
                      selected: !_enabled,
                      live: false,
                      onTap: () => setState(() => _enabled = false),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _enabled
                    ? 'This price is included in the month total.'
                    : 'It stays in the list. The price is left out of the total.',
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 12.5,
                  height: 1.35,
                  color: Lg.muted,
                ),
              ),
              const SizedBox(height: 14),
              _Field(
                label: 'Product URL',
                controller: _url,
                hint: 'https://',
                url: true,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _UrlAction(
                      icon: Icons.content_paste_rounded,
                      label: 'Paste',
                      onTap: _pasteUrl,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _UrlAction(
                      icon: Icons.smartphone_rounded,
                      label: 'Phone',
                      onTap: _openUrlHere,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _UrlAction(
                      icon: Icons.desktop_windows_rounded,
                      label: 'Computer',
                      onTap: _openUrlOnComputer,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _Field(
                label: 'Comment',
                controller: _comment,
                hint: 'Short note',
              ),
              if (widget.good.returnedOn != null) ...[
                const SizedBox(height: 14),
                Text(
                  'Returned · ${formatDotDate(widget.good.returnedOn!)}',
                  style: const TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Lg.emerald,
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 13,
                    color: Lg.coral,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              LgButton(label: 'Save changes', busy: _busy, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailPhoto extends StatefulWidget {
  const _DetailPhoto({required this.dataUrl, required this.onZoom});

  final String? dataUrl;
  final VoidCallback onZoom;

  @override
  State<_DetailPhoto> createState() => _DetailPhotoState();
}

class _DetailPhotoState extends State<_DetailPhoto> {
  double? _aspect;

  @override
  void initState() {
    super.initState();
    _readAspect();
  }

  @override
  void didUpdateWidget(_DetailPhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.dataUrl != widget.dataUrl) {
      _aspect = null;
      _readAspect();
    }
  }

  Future<void> _readAspect() async {
    final url = widget.dataUrl;
    final bytes = goodPhotoBytes(url);
    if (url == null || bytes == null) return;
    try {
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      final width = frame.image.width;
      final height = frame.image.height;
      frame.image.dispose();
      codec.dispose();
      if (!mounted || widget.dataUrl != url || height == 0) return;
      setState(() => _aspect = width / height);
    } catch (_) {
      if (!mounted || widget.dataUrl != url) return;
      setState(() => _aspect = 4 / 3);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = goodPhotoBytes(widget.dataUrl);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF7F1E6),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Lg.line),
        boxShadow: const [
          BoxShadow(
            color: Color(0x102A2F2B),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(23),
        child: bytes == null ? const _EmptyPhoto() : _framed(bytes),
      ),
    );
  }

  Widget _framed(Uint8List bytes) {
    final aspect = _aspect ?? 4 / 3;
    return GestureDetector(
      onTap: widget.onZoom,
      child: SizedBox(
        height: 188,
        width: double.infinity,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxWidth = (constraints.maxWidth - 48).clamp(
              0.0,
              constraints.maxWidth,
            );
            const maxHeight = 156.0;
            var width = maxWidth.toDouble();
            var height = width / aspect;
            if (height > maxHeight) {
              height = maxHeight;
              width = height * aspect;
            }
            return Center(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: ColoredBox(
                  color: Lg.ivoryDeep,
                  child: SizedBox(
                    width: width,
                    height: height,
                    child: Image.memory(
                      bytes,
                      fit: BoxFit.contain,
                      alignment: Alignment.center,
                      gaplessPlayback: true,
                      filterQuality: FilterQuality.medium,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _EmptyPhoto extends StatelessWidget {
  const _EmptyPhoto();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 148,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.photo_outlined, color: Lg.goldDark, size: 26),
          SizedBox(height: 8),
          Text(
            'Add a photo',
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: Lg.charcoal,
            ),
          ),
          SizedBox(height: 2),
          Text(
            'Camera, library, or another app.',
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 12,
              color: Lg.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChoice extends StatelessWidget {
  const _StatusChoice({
    required this.title,
    required this.caption,
    required this.selected,
    required this.live,
    required this.onTap,
  });

  final String title;
  final String caption;
  final bool selected;
  final bool live;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = live ? Lg.emerald : Lg.coral;
    final wash = live ? Lg.emeraldSoft : Lg.coralSoft;
    return Material(
      color: selected ? wash : Lg.panel,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? tone : Lg.line,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: selected ? tone : Lg.charcoal,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                caption,
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 12,
                  color: selected ? tone : Lg.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PhotoIcon extends StatelessWidget {
  const _PhotoIcon({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Lg.panel,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0x66C19A55)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: Lg.goldDark),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Lg.goldDark,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _CropDrag { none, move, left, right, top, bottom, tl, tr, bl, br }

class _PhotoCropPage extends StatefulWidget {
  const _PhotoCropPage({required this.bytes});

  final Uint8List bytes;

  @override
  State<_PhotoCropPage> createState() => _PhotoCropPageState();
}

class _PhotoCropPageState extends State<_PhotoCropPage> {
  ui.Image? _image;
  Rect _norm = const Rect.fromLTWH(0.08, 0.08, 0.84, 0.84);
  _CropDrag _drag = _CropDrag.none;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _decode();
  }

  @override
  void dispose() {
    _image?.dispose();
    super.dispose();
  }

  Future<void> _decode() async {
    try {
      final codec = await ui.instantiateImageCodec(widget.bytes);
      final frame = await codec.getNextFrame();
      codec.dispose();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() => _image = frame.image);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not open that photo.');
    }
  }

  Rect _fitted(Size size, double aspect) {
    const pad = 18.0;
    final bounds = Rect.fromLTWH(
      pad,
      pad,
      (size.width - pad * 2).clamp(1, size.width),
      (size.height - pad * 2).clamp(1, size.height),
    );
    final boundsAspect = bounds.width / bounds.height;
    if (aspect > boundsAspect) {
      final height = bounds.width / aspect;
      return Rect.fromLTWH(
        bounds.left,
        bounds.top + (bounds.height - height) / 2,
        bounds.width,
        height,
      );
    }
    final width = bounds.height * aspect;
    return Rect.fromLTWH(
      bounds.left + (bounds.width - width) / 2,
      bounds.top,
      width,
      bounds.height,
    );
  }

  Rect _cropOf(Rect imageRect) {
    return Rect.fromLTWH(
      imageRect.left + _norm.left * imageRect.width,
      imageRect.top + _norm.top * imageRect.height,
      _norm.width * imageRect.width,
      _norm.height * imageRect.height,
    );
  }

  void _start(Offset point, Rect crop) {
    const corner = 28.0;
    if ((point - crop.topLeft).distance <= corner) {
      _drag = _CropDrag.tl;
    } else if ((point - crop.topRight).distance <= corner) {
      _drag = _CropDrag.tr;
    } else if ((point - crop.bottomLeft).distance <= corner) {
      _drag = _CropDrag.bl;
    } else if ((point - crop.bottomRight).distance <= corner) {
      _drag = _CropDrag.br;
    } else if ((point.dx - crop.left).abs() <= 18 &&
        point.dy >= crop.top &&
        point.dy <= crop.bottom) {
      _drag = _CropDrag.left;
    } else if ((point.dx - crop.right).abs() <= 18 &&
        point.dy >= crop.top &&
        point.dy <= crop.bottom) {
      _drag = _CropDrag.right;
    } else if ((point.dy - crop.top).abs() <= 18 &&
        point.dx >= crop.left &&
        point.dx <= crop.right) {
      _drag = _CropDrag.top;
    } else if ((point.dy - crop.bottom).abs() <= 18 &&
        point.dx >= crop.left &&
        point.dx <= crop.right) {
      _drag = _CropDrag.bottom;
    } else if (crop.contains(point)) {
      _drag = _CropDrag.move;
    } else {
      _drag = _CropDrag.none;
    }
  }

  void _move(Offset delta, Rect imageRect) {
    if (_drag == _CropDrag.none || imageRect.width <= 0 || imageRect.height <= 0) {
      return;
    }
    final dx = delta.dx / imageRect.width;
    final dy = delta.dy / imageRect.height;
    var left = _norm.left;
    var top = _norm.top;
    var right = _norm.right;
    var bottom = _norm.bottom;
    const min = 0.18;
    switch (_drag) {
      case _CropDrag.none:
        return;
      case _CropDrag.move:
        {
          final width = right - left;
          final height = bottom - top;
          left = (left + dx).clamp(0.0, 1 - width);
          top = (top + dy).clamp(0.0, 1 - height);
          right = left + width;
          bottom = top + height;
        }
      case _CropDrag.left:
        left = (left + dx).clamp(0.0, right - min);
      case _CropDrag.right:
        right = (right + dx).clamp(left + min, 1.0);
      case _CropDrag.top:
        top = (top + dy).clamp(0.0, bottom - min);
      case _CropDrag.bottom:
        bottom = (bottom + dy).clamp(top + min, 1.0);
      case _CropDrag.tl:
        left = (left + dx).clamp(0.0, right - min);
        top = (top + dy).clamp(0.0, bottom - min);
      case _CropDrag.tr:
        right = (right + dx).clamp(left + min, 1.0);
        top = (top + dy).clamp(0.0, bottom - min);
      case _CropDrag.bl:
        left = (left + dx).clamp(0.0, right - min);
        bottom = (bottom + dy).clamp(top + min, 1.0);
      case _CropDrag.br:
        right = (right + dx).clamp(left + min, 1.0);
        bottom = (bottom + dy).clamp(top + min, 1.0);
    }
    setState(() => _norm = Rect.fromLTRB(left, top, right, bottom));
  }

  bool get _almostFull =>
      _norm.left <= 0.015 &&
      _norm.top <= 0.015 &&
      _norm.right >= 0.985 &&
      _norm.bottom >= 0.985;

  Future<void> _useCrop() async {
    final image = _image;
    if (image == null || _busy) return;
    if (_almostFull) {
      Navigator.pop(context, widget.bytes);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final bytes = await _encodeCrop(image, _norm);
      if (!mounted) return;
      Navigator.pop(context, bytes);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Could not crop that photo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final image = _image;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        backgroundColor: Lg.ivory,
        body: SafeArea(
          child: Column(
            children: [
              SizedBox(
                height: 52,
                child: Row(
                  children: [
                    IconButton(
                      onPressed: _busy ? null : () => Navigator.pop(context),
                      icon: const Icon(Icons.close, color: Lg.charcoal),
                    ),
                    const Expanded(
                      child: Text(
                        'Crop photo',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: Lg.display,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: Lg.charcoal,
                        ),
                      ),
                    ),
                    const SizedBox(width: 48),
                  ],
                ),
              ),
              const Text(
                'Drag the frame. Corners resize it.',
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 12.5,
                  color: Lg.muted,
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: image == null
                    ? Center(
                        child: _error == null
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Lg.goldDark,
                                ),
                              )
                            : const SizedBox.shrink(),
                      )
                    : LayoutBuilder(
                        builder: (context, constraints) {
                          final size = Size(
                            constraints.maxWidth,
                            constraints.maxHeight,
                          );
                          final imageRect = _fitted(
                            size,
                            image.width / image.height,
                          );
                          final crop = _cropOf(imageRect);
                          return GestureDetector(
                            onPanStart: (details) =>
                                _start(details.localPosition, crop),
                            onPanUpdate: (details) =>
                                _move(details.delta, imageRect),
                            onPanEnd: (_) => _drag = _CropDrag.none,
                            child: CustomPaint(
                              size: size,
                              painter: _CropPainter(
                                image: image,
                                imageRect: imageRect,
                                crop: crop,
                              ),
                            ),
                          );
                        },
                      ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: Lg.sans,
                      fontSize: 13,
                      color: Lg.coral,
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                child: Column(
                  children: [
                    TextButton(
                      onPressed: _busy || image == null
                          ? null
                          : () => Navigator.pop(context, widget.bytes),
                      child: const Text(
                        'Keep the full photo',
                        style: TextStyle(
                          fontFamily: Lg.sans,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: Lg.goldDark,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: LgButton(
                            label: 'Cancel',
                            filled: false,
                            onPressed: _busy
                                ? null
                                : () => Navigator.pop(context),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LgButton(
                            label: 'Use crop',
                            busy: _busy,
                            onPressed: image == null ? null : _useCrop,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<Uint8List> _encodeCrop(ui.Image image, Rect norm) async {
  final src = Rect.fromLTRB(
    (norm.left * image.width).clamp(0, image.width.toDouble()),
    (norm.top * image.height).clamp(0, image.height.toDouble()),
    (norm.right * image.width).clamp(0, image.width.toDouble()),
    (norm.bottom * image.height).clamp(0, image.height.toDouble()),
  );
  var edge = 1024;
  Uint8List? bytes;
  while (edge >= 640) {
    bytes = await _rasterCrop(image, src, edge);
    if (bytes.length <= 1800000) return bytes;
    edge = (edge * 0.75).round();
  }
  return bytes!;
}

Future<Uint8List> _rasterCrop(ui.Image image, Rect src, int maxEdge) async {
  var width = src.width.round().clamp(1, image.width);
  var height = src.height.round().clamp(1, image.height);
  final longSide = width > height ? width : height;
  if (longSide > maxEdge) {
    final scale = maxEdge / longSide;
    width = (width * scale).round().clamp(1, maxEdge);
    height = (height * scale).round().clamp(1, maxEdge);
  }
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawImageRect(
    image,
    src,
    Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    Paint()..filterQuality = FilterQuality.high,
  );
  final picture = recorder.endRecording();
  final out = await picture.toImage(width, height);
  picture.dispose();
  final data = await out.toByteData(format: ui.ImageByteFormat.png);
  out.dispose();
  if (data == null) throw StateError('Could not crop that photo.');
  return data.buffer.asUint8List();
}

class _CropPainter extends CustomPainter {
  const _CropPainter({
    required this.image,
    required this.imageRect,
    required this.crop,
  });

  final ui.Image image;
  final Rect imageRect;
  final Rect crop;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(imageRect, const Radius.circular(16)),
      Paint()..color = Lg.ivoryDeep,
    );
    canvas.save();
    canvas.clipRRect(
      RRect.fromRectAndRadius(imageRect, const Radius.circular(16)),
    );
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      imageRect,
      Paint()..filterQuality = FilterQuality.medium,
    );
    final shade = Path()
      ..addRect(imageRect)
      ..addRect(crop)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(shade, Paint()..color = const Color(0x992A2F2B));
    final guide = Paint()
      ..strokeWidth = 0.7
      ..color = const Color(0x66FFFFFF);
    for (var i = 1; i <= 2; i++) {
      final x = crop.left + crop.width * i / 3;
      final y = crop.top + crop.height * i / 3;
      canvas.drawLine(Offset(x, crop.top), Offset(x, crop.bottom), guide);
      canvas.drawLine(Offset(crop.left, y), Offset(crop.right, y), guide);
    }
    canvas.drawRect(
      crop,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = const Color(0xFFF0E4C8),
    );
    canvas.restore();
    const arm = 16.0;
    final gold = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.square
      ..color = Lg.gold;
    void corner(Offset origin, Offset across, Offset down) {
      canvas.drawLine(origin, origin + across, gold);
      canvas.drawLine(origin, origin + down, gold);
    }

    corner(crop.topLeft, const Offset(arm, 0), const Offset(0, arm));
    corner(crop.topRight, const Offset(-arm, 0), const Offset(0, arm));
    corner(crop.bottomLeft, const Offset(arm, 0), const Offset(0, -arm));
    corner(crop.bottomRight, const Offset(-arm, 0), const Offset(0, -arm));
  }

  @override
  bool shouldRepaint(_CropPainter oldDelegate) {
    return oldDelegate.crop != crop ||
        oldDelegate.imageRect != imageRect ||
        oldDelegate.image != image;
  }
}

class _PhotoZoom extends StatelessWidget {
  const _PhotoZoom({required this.dataUrl});

  final String dataUrl;

  @override
  Widget build(BuildContext context) {
    final bytes = goodPhotoBytes(dataUrl);
    return Scaffold(
      backgroundColor: const Color(0xFF1C1A16),
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                child: bytes == null
                    ? const SizedBox.shrink()
                    : Image.memory(bytes, fit: BoxFit.contain),
              ),
            ),
            Positioned(
              top: 8,
              left: 8,
              child: IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuietLabel extends StatelessWidget {
  const _QuietLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: Lg.sans,
        fontSize: 12.5,
        fontWeight: FontWeight.w500,
        color: Lg.muted,
      ),
    );
  }
}

class _CategoryField extends StatelessWidget {
  const _CategoryField({required this.category, required this.onTap});

  final ({String id, String label, IconData icon}) category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _QuietLabel('Category'),
        const SizedBox(height: 8),
        Material(
          color: Lg.panel,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Lg.line),
              ),
              child: Row(
                children: [
                  _CategoryIcon(icon: category.icon, solid: true),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      category.label,
                      style: const TextStyle(
                        fontFamily: Lg.sans,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: Lg.charcoal,
                      ),
                    ),
                  ),
                  const Icon(Icons.expand_more, color: Lg.muted, size: 20),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _CategoryMenu extends StatelessWidget {
  const _CategoryMenu({required this.selected, required this.onPick});

  final String selected;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight;
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: height.isFinite ? height - 48 : 0,
            ),
            child: Center(
              child: Material(
                color: Lg.panel,
                elevation: 18,
                shadowColor: const Color(0x402A2F2B),
                borderRadius: BorderRadius.circular(22),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Choose type',
                        style: TextStyle(
                          fontFamily: Lg.display,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.3,
                          color: Lg.charcoal,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Each type keeps its own icon.',
                        style: TextStyle(
                          fontFamily: Lg.sans,
                          fontSize: 12.5,
                          color: Lg.muted,
                        ),
                      ),
                      const SizedBox(height: 12),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 3.15,
                        children: [
                          for (final category in goodCategories)
                            _CategoryOption(
                              category: category,
                              selected: category.id == selected,
                              onTap: () => onPick(category.id),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _CategoryOption extends StatelessWidget {
  const _CategoryOption({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final ({String id, String label, IconData icon}) category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? const Color(0xFF3CB884) : Lg.ivory,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              _CategoryIcon(icon: category.icon, onDark: selected),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  category.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                    color: selected ? Colors.white : Lg.charcoal,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryIcon extends StatelessWidget {
  const _CategoryIcon({
    required this.icon,
    this.onDark = false,
    this.solid = false,
  });

  final IconData icon;
  final bool onDark;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: solid
            ? Lg.emerald
            : onDark
            ? const Color(0x22FFFFFF)
            : Lg.emeraldSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(
        icon,
        size: 17,
        color: solid || onDark ? Colors.white : Lg.emerald,
      ),
    );
  }
}

class _TapField extends StatelessWidget {
  const _TapField({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _QuietLabel(label),
        const SizedBox(height: 8),
        Material(
          color: Lg.panel,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Lg.line),
              ),
              child: Row(
                children: [
                  Icon(icon, size: 16, color: Lg.goldDark),
                  const SizedBox(width: 10),
                  Text(
                    value,
                    style: const TextStyle(
                      fontFamily: Lg.sans,
                      fontSize: 15,
                      color: Lg.charcoal,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    this.hint,
    this.onPaste,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final Future<void> Function()? onPaste;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _QuietLabel(label),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: onPaste != null
              ? TextInputType.url
              : TextInputType.text,
          style: const TextStyle(
            fontFamily: Lg.sans,
            fontSize: 15,
            color: Lg.charcoal,
          ),
          cursorColor: Lg.goldDark,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Lg.muted, fontFamily: Lg.sans),
            filled: true,
            fillColor: Lg.panel,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            suffixIcon: onPaste == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: _UrlPasteButton(onTap: onPaste!),
                  ),
            suffixIconConstraints: onPaste == null
                ? null
                : const BoxConstraints(minHeight: 36, minWidth: 36),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Lg.line),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Lg.gold),
            ),
          ),
        ),
      ],
    );
  }
}

class _UrlPasteButton extends StatelessWidget {
  const _UrlPasteButton({required this.onTap});

  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Lg.goldSoft,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: () => onTap(),
        borderRadius: BorderRadius.circular(10),
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.content_paste_rounded, size: 15, color: Color(0xFF7A5B1F)),
              SizedBox(width: 5),
              Text(
                'Paste',
                style: TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF7A5B1F),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Lg.goldSoft : Lg.panel,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? Lg.gold : Lg.line),
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: Lg.sans,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? Lg.goldDark : Lg.charcoal,
            ),
          ),
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.title,
    required this.body,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String body;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return LgCard(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Lg.charcoal,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  body,
                  style: const TextStyle(
                    fontFamily: Lg.sans,
                    fontSize: 12,
                    height: 1.35,
                    color: Lg.muted,
                  ),
                ),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
