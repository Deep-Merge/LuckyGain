import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../db/ledger_store.dart';
import '../lock/app_lock.dart';
import '../money.dart';
import '../theme/lg_colors.dart';
import '../widgets/lg_motion.dart';
import '../widgets/lg_widgets.dart';

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
      );
      if (file == null) {
        final lost = await picker.retrieveLostData();
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
      setState(() {
        _image = 'data:$mime;base64,${base64Encode(bytes)}';
        _error = null;
      });
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() => _error = _photoError(source, error.code));
    } finally {
      widget.lock.suppressLock = false;
    }
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
              GestureDetector(
                onTap: _zoom,
                child: GoodPhoto(dataUrl: _image, expand: true, radius: 22),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _PhotoAction(
                    icon: Icons.photo_camera_outlined,
                    label: 'Take photo',
                    onTap: () => _pickPhoto(ImageSource.camera),
                  ),
                  _PhotoAction(
                    icon: Icons.photo_outlined,
                    label: _image == null ? 'Choose photo' : 'Replace',
                    onTap: () => _pickPhoto(ImageSource.gallery),
                  ),
                  if (_image != null)
                    _PhotoAction(
                      icon: Icons.close,
                      label: 'Remove',
                      onTap: () => setState(() => _image = null),
                    ),
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
              const SizedBox(height: 8),
              _SwitchRow(
                title: 'Enabled',
                body: 'Off keeps it in the list, but leaves it out of totals.',
                value: _enabled,
                onChanged: (value) => setState(() => _enabled = value),
              ),
              const SizedBox(height: 14),
              _Field(label: 'Product URL', controller: _url, hint: 'https://'),
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

class _PhotoAction extends StatelessWidget {
  const _PhotoAction({
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
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0x66C19A55)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: Lg.goldDark),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(
                  fontFamily: Lg.sans,
                  fontSize: 13,
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
  const _Field({required this.label, required this.controller, this.hint});

  final String label;
  final TextEditingController controller;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _QuietLabel(label),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
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
