package com.codestream.actions

import com.codestream.codeStream
import com.codestream.editorService
import com.codestream.extensions.selectionOrCurrentLine
import com.codestream.extensions.uri
import com.codestream.protocols.CodemarkType
import com.codestream.protocols.webview.CodemarkNotifications
import com.codestream.webViewService
import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.codeInsight.intention.LowPriorityAction
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.util.Iconable
import com.intellij.psi.PsiFile
import java.awt.event.KeyEvent

abstract class NewCodemark(val type: CodemarkType) : DumbAwareAction(), IntentionAction, LowPriorityAction, Iconable {
    private fun execute(project: Project, source: String) {
        project.editorService?.activeEditor?.run {
            project.codeStream?.show {
                project.webViewService?.postNotification(
                    CodemarkNotifications.New(
                        document.uri,
                        selectionOrCurrentLine,
                        type,
                        source
                    )
                )
            }
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val source = when {
            ActionPlaces.isPopupPlace(e.place) -> "Context Menu"
            e.inputEvent is KeyEvent -> "Shortcut"
            else -> "Action List"
        }
        e.project?.let { execute(it, source) }
    }

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        execute(project, "Lightbulb Menu")
    }

    override fun startInWriteAction() = true

    override fun getFamilyName() = "CodeStream"

    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?) = true
}

class AddComment : NewCodemark(CodemarkType.COMMENT) {
    override fun getText() = "Add comment"
    override fun getIcon(flags: Int) = IconLoader.getIcon("/images/marker-comment.svg")
}

class CreateIssue : NewCodemark(CodemarkType.ISSUE) {
    override fun getText() = "Create issue"
    override fun getIcon(flags: Int) = IconLoader.getIcon("/images/marker-issue.svg")
}

class GetPermalink : NewCodemark(CodemarkType.LINK) {
    override fun getText() = "Get permalink"
    override fun getIcon(flags: Int) = IconLoader.getIcon("/images/marker-permalink.svg")
}
