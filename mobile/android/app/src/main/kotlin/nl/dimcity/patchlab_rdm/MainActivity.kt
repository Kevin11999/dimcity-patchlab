package nl.dimcity.patchlab_rdm

import android.content.Context
import android.net.wifi.WifiManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Holds a WifiManager.MulticastLock while the Dart side asks for it, so the
 * phone keeps receiving multicast and broadcast UDP (ArtPollReply, LLRP, mDNS).
 */
class MainActivity : FlutterActivity() {
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "nl.dimcity.patchlab_rdm/multicast")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "acquire" -> {
                        try {
                            if (multicastLock == null) {
                                val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                                multicastLock = wifi.createMulticastLock("patchlab_rdm").apply {
                                    setReferenceCounted(false)
                                }
                            }
                            multicastLock?.acquire()
                            result.success(null)
                        } catch (e: Exception) {
                            result.error("multicast", e.message, null)
                        }
                    }
                    "release" -> {
                        try {
                            multicastLock?.takeIf { it.isHeld }?.release()
                            result.success(null)
                        } catch (e: Exception) {
                            result.error("multicast", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onDestroy() {
        multicastLock?.takeIf { it.isHeld }?.release()
        super.onDestroy()
    }
}
