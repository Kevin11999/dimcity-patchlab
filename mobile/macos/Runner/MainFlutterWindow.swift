import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController
    // The app is laid out like the phone version in a centred column: start with a tall window.
    self.minSize = NSSize(width: 420, height: 600)
    self.setFrame(NSRect(x: self.frame.origin.x, y: self.frame.origin.y, width: 900, height: 860), display: true)
    self.center()

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
