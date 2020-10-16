package com.codestream.webview

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import java.awt.BorderLayout
import javax.swing.JPanel

class CodeStreamToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        toolWindow.contentManager.addContent(
            toolWindow.contentManager.factory.createContent(
                JPanel(BorderLayout()),
                "",
                false
            )
        )
    }
}
