package com.codestream.webview

import com.codestream.agentService
import com.codestream.webViewService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import java.awt.BorderLayout
import javax.swing.JLabel
import javax.swing.JPanel

class CodeStreamToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val csPanel = JPanel(BorderLayout())
        val loadingLabel = JLabel("Loading...", IconLoader.getIcon("/images/codestream.svg"), JLabel.CENTER)
        csPanel.add(loadingLabel)

        project.agentService?.onDidStart {
            val webViewService = project.webViewService ?: return@onDidStart
            webViewService.load()
            ApplicationManager.getApplication().invokeLater {
                csPanel.remove(loadingLabel)
                csPanel.add(webViewService.webView)
            }
        }

        toolWindow.contentManager.addContent(
            toolWindow.contentManager.factory.createContent(
                csPanel,
                "",
                false
            )
        )
    }
}
