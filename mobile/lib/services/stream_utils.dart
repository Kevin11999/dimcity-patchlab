import 'dart:async';

/// Waits for the first event of [stream] that passes [test]; null on timeout.
Future<T?> firstMatching<T>(Stream<T> stream, bool Function(T) test, Duration timeout) {
  final completer = Completer<T?>();
  late StreamSubscription<T> sub;
  final timer = Timer(timeout, () {
    if (!completer.isCompleted) completer.complete(null);
  });
  sub = stream.listen((e) {
    if (!completer.isCompleted && test(e)) completer.complete(e);
  }, onDone: () {
    if (!completer.isCompleted) completer.complete(null);
  });
  return completer.future.whenComplete(() {
    timer.cancel();
    unawaited(sub.cancel());
  });
}

/// Collects every event that passes [test] during [window].
Future<List<T>> collectDuring<T>(Stream<T> stream, bool Function(T) test, Duration window, {bool Function(List<T>)? stopWhen}) {
  final out = <T>[];
  final completer = Completer<List<T>>();
  late StreamSubscription<T> sub;
  final timer = Timer(window, () {
    if (!completer.isCompleted) completer.complete(out);
  });
  sub = stream.listen((e) {
    if (test(e)) {
      out.add(e);
      if (stopWhen != null && stopWhen(out) && !completer.isCompleted) completer.complete(out);
    }
  }, onDone: () {
    if (!completer.isCompleted) completer.complete(out);
  });
  return completer.future.whenComplete(() {
    timer.cancel();
    unawaited(sub.cancel());
  });
}
