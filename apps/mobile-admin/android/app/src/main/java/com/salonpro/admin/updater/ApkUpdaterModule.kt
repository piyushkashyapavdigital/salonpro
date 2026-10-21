package com.salonpro.admin.updater

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Sideloaded APK updates.
 *
 * The JavaScript side decides *whether* an update exists (GitHub Releases); this
 * module does the part a browser would otherwise do: download the APK in the
 * background, verify it, and hand it to Android's package installer.
 *
 * Android always shows its own confirmation before installing. That is not
 * something an ordinary app can skip - silent installs need device-owner
 * privileges. The point here is that the user never leaves SalonPro to fetch a
 * file from GitHub by hand.
 */
class ApkUpdaterModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun getName(): String = NAME

  @ReactMethod
  fun getVersionCode(promise: Promise) {
    try {
      promise.resolve(currentVersionCode())
    } catch (error: Exception) {
      promise.reject("version_unavailable", error.message, error)
    }
  }

  @ReactMethod
  fun getVersionName(promise: Promise) {
    try {
      promise.resolve(currentVersionName())
    } catch (error: Exception) {
      promise.reject("version_unavailable", error.message, error)
    }
  }

  /** True when Android will let this app open its package installer. */
  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    promise.resolve(canInstall())
  }

  /** Opens the per-app "Install unknown apps" switch in system Settings. */
  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + reactContext.packageName))
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("settings_unavailable", error.message, error)
    }
  }

  /**
   * Downloads [url] to the app cache and opens the installer.
   *
   * [expectedSha256] is GitHub's `sha256:...` asset digest when the release API
   * provides one; pass null to skip the checksum. Installation is never silent:
   * the promise resolves as soon as Android's installer is on screen.
   */
  @ReactMethod
  fun downloadAndInstall(url: String, fileName: String, expectedSha256: String?, promise: Promise) {
    worker.execute {
      try {
        val file = download(url, fileName, expectedSha256)
        main.post {
          try {
            openInstaller(file)
            promise.resolve(file.absolutePath)
          } catch (error: Exception) {
            promise.reject("install_unavailable", error.message ?: "Could not open Android's installer.", error)
          }
        }
      } catch (error: Exception) {
        main.post {
          promise.reject("download_failed", error.message ?: "The update could not be downloaded.", error)
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */

  @Suppress("DEPRECATION")
  private fun currentVersionCode(): Int {
    val info = reactContext.packageManager.getPackageInfo(reactContext.packageName, 0)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode.toInt()
    } else {
      info.versionCode
    }
  }

  @Suppress("DEPRECATION")
  private fun currentVersionName(): String {
    val info = reactContext.packageManager.getPackageInfo(reactContext.packageName, 0)
    return info.versionName ?: "0.0.0"
  }

  private fun canInstall(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.packageManager.canRequestPackageInstalls()
    } else {
      true
    }

  private fun download(url: String, fileName: String, expectedSha256: String?): File {
    val directory = File(reactContext.cacheDir, "updates").apply { mkdirs() }
    val safeName = fileName.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._-]"), "_")
    if (!safeName.endsWith(".apk", ignoreCase = true)) {
      throw IOException("That download is not an APK.")
    }

    // One cached update at a time: remove older files so the cache cannot grow
    // by ~70 MB per release.
    directory.listFiles()?.forEach { if (it.name != safeName) it.delete() }
    val target = File(directory, safeName)
    if (target.exists() && !target.delete()) {
      throw IOException("Could not clear the previous download.")
    }

    var current = URL(url)
    var redirects = 0
    var connection: HttpURLConnection
    while (true) {
      connection = (current.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 20_000
        readTimeout = 30_000
        setRequestProperty("User-Agent", "SalonPro-Updater")
        setRequestProperty("Accept", "application/octet-stream")
      }
      val code = connection.responseCode
      if (code in 300..399) {
        val location = connection.getHeaderField("Location")
        connection.disconnect()
        if (location.isNullOrBlank()) throw IOException("The download redirect was empty.")
        current = URL(current, location)
        if (++redirects > 8) throw IOException("Too many download redirects.")
        continue
      }
      if (code !in 200..299) {
        connection.disconnect()
        throw IOException("The download failed (HTTP " + code + ").")
      }
      break
    }

    try {
      val total = connection.contentLengthLong
      var received = 0L
      var lastReport = 0L
      connection.inputStream.use { input ->
        FileOutputStream(target).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
            received += read
            val now = System.currentTimeMillis()
            if (now - lastReport >= 250 || (total > 0 && received >= total)) {
              lastReport = now
              reportProgress(received, total)
            }
          }
        }
      }
      if (total > 0 && received != total) {
        throw IOException("The download stopped early. Please try again.")
      }
      if (received <= 0L) throw IOException("The downloaded file was empty.")
      verify(target, expectedSha256)
      return target
    } catch (error: Exception) {
      target.delete()
      throw error
    } finally {
      connection.disconnect()
    }
  }

  @Suppress("DEPRECATION")
  private fun verify(file: File, expectedSha256: String?) {
    if (!expectedSha256.isNullOrBlank()) {
      val expected = expectedSha256.removePrefix("sha256:").trim().lowercase()
      val actual = sha256(file)
      if (actual != expected) {
        throw IOException("The update failed its checksum check. Please download it again.")
      }
    }

    val archive = reactContext.packageManager.getPackageArchiveInfo(file.absolutePath, 0)
      ?: throw IOException("The downloaded file is not an Android app.")
    if (archive.packageName != reactContext.packageName) {
      throw IOException("That APK belongs to another app, so it was discarded.")
    }
    val incoming = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      archive.longVersionCode
    } else {
      archive.versionCode.toLong()
    }
    if (incoming <= currentVersionCode().toLong()) {
      throw IOException("That build is not newer than the installed app.")
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(256 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    val bytes = digest.digest()
    val hex = StringBuilder(bytes.size * 2)
    for (byte in bytes) hex.append("%02x".format(byte))
    return hex.toString()
  }

  private fun reportProgress(received: Long, total: Long) {
    val payload = Arguments.createMap().apply {
      putDouble("received", received.toDouble())
      putDouble("total", total.toDouble())
      putDouble(
        "percent",
        if (total > 0) (received.toDouble() * 100.0 / total.toDouble()).coerceIn(0.0, 100.0) else 0.0,
      )
    }
    main.post { reactContext.emitDeviceEvent("ApkUpdaterProgress", payload) }
  }

  companion object {
    const val NAME = "ApkUpdater"
  }

  private fun openInstaller(file: File) {
    val authority = reactContext.packageName + ".fileprovider"
    val uri = FileProvider.getUriForFile(reactContext, authority, file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      clipData = ClipData.newRawUri("SalonPro update", uri)
    }
    reactContext.startActivity(intent)
  }
}
