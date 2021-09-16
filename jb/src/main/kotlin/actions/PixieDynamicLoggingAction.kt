package com.codestream.actions

import com.codestream.agentService
import com.codestream.protocols.agent.PixieDynamicLoggingFunctionParameter
import com.codestream.protocols.agent.PixieDynamicLoggingParams
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.psi.impl.source.tree.LeafPsiElement
import com.intellij.psi.util.elementType
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

class PixieDynamicLoggingAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        ApplicationManager.getApplication().invokeLater {
                val psiElement = CommonDataKeys.PSI_ELEMENT.getData(e.dataContext)
                if (psiElement?.elementType?.debugName == "FUNCTION_DECLARATION" && psiElement.elementType?.language?.id == "go") {
                    val name = (psiElement.node.firstChildNode as LeafPsiElement).nextSibling.nextSibling.text
                    val psiSignature = psiElement.children.find { it.elementType?.debugName == "SIGNATURE" }
                    val psiParameters = psiSignature?.children?.find { it.elementType?.debugName == "PARAMETERS" }

                    val parameters = mutableListOf<PixieDynamicLoggingFunctionParameter>()
                    psiParameters?.children?.forEach { p ->
                        val type = p.children.find { c -> c.elementType?.debugName == "TYPE" }
                        val definition = p.children.find { c -> c.elementType?.debugName == "PARAM_DEFINITION" }
                        if (type != null && definition != null) {
                            val parameter = PixieDynamicLoggingFunctionParameter(definition.text, type.text)
                            parameters.add(parameter)
                        } else {
                            // ???
                        }
                    }
                    GlobalScope.launch {
                        val result = e.project?.agentService?.pixieDynamicLogging(
                            PixieDynamicLoggingParams(
                                name,
                                parameters,
                                null
                            )
                        )
                        val recentArgsAsString = result?.recentArgs?.joinToString(", ")
                        val message = "Recent arguments: $recentArgsAsString"
                        ApplicationManager.getApplication().invokeLater {
                            SampleDialogWrapper(message).show()
                        }
                    }
                } else {
                    SampleDialogWrapper("You can't do that here").show()
                }
            }
        }
    }

    class SampleDialogWrapper(val message: String) : DialogWrapper(true) {
        override fun createCenterPanel(): JComponent? {
            val dialogPanel = JPanel(BorderLayout())
            val label = JLabel(message)
            label.preferredSize = Dimension(100, 100)
            dialogPanel.add(label, BorderLayout.CENTER)
            return dialogPanel
        }

        init {
            title = "Pixie Dynamic Logging"
            init()
        }
    }
