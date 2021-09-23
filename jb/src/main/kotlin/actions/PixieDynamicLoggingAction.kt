package com.codestream.actions

import com.codestream.GLOBAL_DYNAMIC_LOGGING_MESSAGE
import com.codestream.agentService
import com.codestream.protocols.agent.PixieDynamicLoggingFunctionParameter
import com.codestream.protocols.agent.PixieDynamicLoggingParams
import com.goide.psi.GoFunctionOrMethodDeclaration
import com.goide.psi.GoMethodDeclaration
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.psi.util.parentsOfType
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel

class PixieDynamicLoggingAction : DumbAwareAction() {

    override fun update(e: AnActionEvent) {
        val psiElement = CommonDataKeys.PSI_ELEMENT.getData(e.dataContext)
        e.presentation.isVisible = psiElement?.parentsOfType<GoFunctionOrMethodDeclaration>(true)?.first() != null
    }

    override fun actionPerformed(e: AnActionEvent) = ApplicationManager.getApplication().invokeLater {
        val psiElement = CommonDataKeys.PSI_ELEMENT.getData(e.dataContext)
        val declaration = psiElement?.parentsOfType<GoFunctionOrMethodDeclaration>(true)?.first()
        if (declaration !is GoFunctionOrMethodDeclaration) {
            return@invokeLater
        }
        val name = declaration.name
        val parameters = declaration.signature?.parameters?.definitionList?.map {
            PixieDynamicLoggingFunctionParameter(it.name!!, it.elementType.debugName)
        }
        val receiver = (declaration as? GoMethodDeclaration)?.receiver?.type?.text
        val pkg = declaration.containingFile.`package`?.name

        // catalogue: 00000008-0000-1a41-0000-0000072e8792
        // simple gotracing: 00000004-0000-3d9e-0000-000001e9f7b4
        GlobalScope.launch {
            val result = e.project?.agentService?.pixieDynamicLogging(
                PixieDynamicLoggingParams(
                    name!!,
                    parameters!!,
                    receiver,
                    pkg!!,
                    "00000008-0000-1a41-0000-0000072e8792"
                )
            )
            GLOBAL_DYNAMIC_LOGGING_MESSAGE.text = "Dynamic Logging ID: ${result?.id}"
           // ApplicationManager.getApplication().invokeLater {
            //    SampleDialogWrapper("").show()
           // }
        }
    }

}

class SampleDialogWrapper(private val message: String) : DialogWrapper(true) {
    override fun createCenterPanel(): JComponent {
        val dialogPanel = JPanel(BorderLayout())
        dialogPanel.add(GLOBAL_DYNAMIC_LOGGING_MESSAGE, BorderLayout.CENTER)
        return dialogPanel
    }

    init {
        title = "Pixie Dynamic Logging"
        init()
    }
}
