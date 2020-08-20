package com.codestream.webview

import com.codestream.DEBUG
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.teamdev.jxbrowser.browser.Browser
import com.teamdev.jxbrowser.engine.Engine
import com.teamdev.jxbrowser.engine.EngineOptions
import com.teamdev.jxbrowser.engine.RenderingMode
import com.teamdev.jxbrowser.net.ResourceType
import com.teamdev.jxbrowser.net.callback.LoadResourceCallback
import com.teamdev.jxbrowser.plugin.callback.AllowPluginCallback
import java.nio.file.Paths

class BrowserEngineService : Disposable {

    private val logger = Logger.getInstance(BrowserEngineService::class.java)
    private val engine: Engine

    init {
        val dir = createTempDir()
        logger.info("JxBrowser work dir: $dir")

        val licenseKey = try {
            javaClass.getResource("/jxbrowser.license").readText().trim()
        } catch (e: Exception) {
            logger.error(e)
            ""
        }

        // System.setProperty("jxbrowser.ipc.external", "true")
        val optionsBuilder = EngineOptions
            .newBuilder(RenderingMode.OFF_SCREEN)
            .licenseKey(licenseKey)
            .userDataDir(Paths.get(dir.toURI()))
            .disableGpu()
            .disableChromiumTraffic()
            .addSwitch("--disable-gpu-compositing")
            .addSwitch("--enable-begin-frame-scheduling")
            .addSwitch("--software-rendering-fps=60")
            //     if (JreHiDpiUtil.isJreHiDPIEnabled() && !SystemInfo.isMac) "--force-device-scale-factor=1" else ""
            .allowFileAccessFromFiles()

        if (DEBUG) {
            optionsBuilder.remoteDebuggingPort(9222)
        }

        val options = optionsBuilder.build()
        engine = Engine.newInstance(options)
        // engine.network()
        engine.spellChecker().disable()
        engine.plugins()
            .set(AllowPluginCallback::class.java, AllowPluginCallback { AllowPluginCallback.Response.deny() })
        engine.network().set(LoadResourceCallback::class.java, LoadResourceCallback {
            if (it.resourceType() == ResourceType.IMAGE || it.url().startsWith("file://")) {
                LoadResourceCallback.Response.load()
            } else {
                if (it.resourceType() == ResourceType.MAIN_FRAME) {
                    BrowserUtil.browse(it.url())
                }
                LoadResourceCallback.Response.cancel()
            }
        })
    }

    fun newBrowser(): Browser {
        // browser.audio().mute()
        // browser.set(ConfirmCallback::class.java, ConfirmCallback { _, tell -> tell.cancel() })
        // browser.set(CertificateErrorCallback::class.java, CertificateErrorCallback { _, action -> action.deny() })
        // browser.set(BeforeUnloadCallback::class.java, BeforeUnloadCallback { _, action -> action.stay() })
        // browser.set(AlertCallback::class.java, AlertCallback { _, action -> action.ok() })
        // browser.set(ConfirmCallback::class.java, ConfirmCallback { _, action -> action.cancel() })
        // browser.set(OpenFileCallback::class.java, OpenFileCallback { _, action -> action.cancel() })
        // browser.set(OpenFilesCallback::class.java, OpenFilesCallback { _, action -> action.cancel() })
        // browser.set(OpenFolderCallback::class.java, OpenFolderCallback { _, action -> action.cancel() })
        // browser.set(PromptCallback::class.java, PromptCallback { _, action -> action.cancel() })
        // browser.set(SelectColorCallback::class.java, SelectColorCallback { _, action -> action.cancel() })
        // browser.set(SelectClientCertificateCallback::class.java, SelectClientCertificateCallback { _, action -> action.cancel() })
        return engine.newBrowser()
    }

    override fun dispose() {
        logger.info("Disposing JxBrowser engine")
        engine.close()
    }
}
