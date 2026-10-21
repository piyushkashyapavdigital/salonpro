package com.salonpro.app.updater

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [ApkUpdaterModule] with React Native. */
class ApkUpdaterPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == ApkUpdaterModule.NAME) ApkUpdaterModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      ApkUpdaterModule.NAME to ReactModuleInfo(
        ApkUpdaterModule.NAME,
        ApkUpdaterModule::class.java.name,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        false, // isTurboModule - a legacy module, reached through the interop layer
      ),
    )
  }
}
