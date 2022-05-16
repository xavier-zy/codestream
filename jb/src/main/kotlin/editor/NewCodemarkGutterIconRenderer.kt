package com.codestream.editor

import com.codestream.actions.AddComment
import com.codestream.actions.CreateIssue
import com.codestream.actions.GetPermalink
import com.codestream.agentService
import com.codestream.codeStream
import com.codestream.extensions.file
import com.codestream.extensions.inlineTextFieldManager
import com.codestream.extensions.selectionOrCurrentLine
import com.codestream.extensions.uri
import com.codestream.protocols.CodemarkType
import com.codestream.protocols.webview.CodemarkNotifications
import com.codestream.review.DIFF_RANGES
import com.codestream.review.PULL_REQUEST
import com.codestream.review.ReviewDiffVirtualFile
import com.codestream.webViewService
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.GutterDraggableObject
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import java.awt.Cursor
import java.awt.dnd.DragSource
import java.util.concurrent.CompletableFuture
import javax.swing.Icon

val ICON = IconLoader.getIcon("/images/marker-add-comment-green.svg")

class NewCodemarkGutterIconRenderer(
    val editor: Editor,
    var line: Int,
    val onClick: () -> Unit,
    val onStartDrag: () -> Unit,
    val onStopDrag: () -> Unit
) : GutterIconRenderer() {

    override fun getIcon(): Icon {
        return ICON
    }

    override fun equals(other: Any?): Boolean {
        val otherRenderer = other as? NewCodemarkGutterIconRenderer ?: return false
        return line == otherRenderer.line
    }

    override fun hashCode(): Int {
        return line.hashCode()
    }

    override fun getClickAction(): AnAction? {
        return if (editor.document.getUserData(PULL_REQUEST) != null) {
            null
        } else if (editor.document.file is ReviewDiffVirtualFile) {
            NewInlineCodemarkGutterIconRendererClickAction(editor, line, onClick)
        } else {
            null
        }
    }

    private val isGitLab: Boolean by lazy {
        val pullRequest = editor.document.getUserData(PULL_REQUEST)
        pullRequest?.providerId?.lowercase()?.contains("gitlab") == true
    }

    private val addSingleCommentText = if (isGitLab) "Add comment now" else "Add single comment"

    override fun getPopupMenuActions(): ActionGroup? {
        val pullRequest = editor.document.getUserData(PULL_REQUEST)
        val isInPrRange = isInPrRange()
        return if (pullRequest != null) {
            val agent = editor.project?.agentService ?: return null
            val future = CompletableFuture<DefaultActionGroup>()
            GlobalScope.launch {
                val reviewId = agent.getPullRequestReviewId(pullRequest.id, pullRequest.providerId)
                val startReviewAction = PullRequestCommentAction("Start a review", true, editor, line, onClick)
                val addSingleCommentAction =
                    PullRequestCommentAction(addSingleCommentText, false, editor, line, onClick)
                val addCommentToReviewAction = PullRequestCommentAction("Add comment to review", true, editor, line, onClick)
                if (!isInPrRange) {
                    future.complete(DefaultActionGroup(addSingleCommentAction))
                } else if (reviewId == null || reviewId.isJsonNull || (reviewId.isJsonPrimitive && reviewId.asJsonPrimitive.isBoolean && !reviewId.asBoolean)) {
                    // GH returns a string ID or null. GL returns true or false.
                    future.complete(DefaultActionGroup(startReviewAction, addSingleCommentAction))
                } else {
                    future.complete(DefaultActionGroup(addCommentToReviewAction))
                }
            }
            future.join()
        } else {
            val addComment = AddComment().also { it.telemetrySource = "Gutter" }
            val createIssue = CreateIssue().also { it.telemetrySource = "Gutter" }
            val getPermalink = GetPermalink().also { it.telemetrySource = "Gutter" }
            DefaultActionGroup(addComment, createIssue, getPermalink)
        }
    }

    override fun getDraggableObject(): GutterDraggableObject {
        onStartDrag()
        return NewCodemarkGutterIconRendererDraggableObject(editor, this.line, onStopDrag)
    }

    override fun getAlignment() = Alignment.LEFT

    private fun isInPrRange(): Boolean {
        val diffRanges = editor.document.getUserData(DIFF_RANGES) ?: return false
        val selection = editor.selectionOrCurrentLine

        val selectionStart = selection.start.line + 1
        val selectionEnd = selection.end.line + 1

        diffRanges.forEach {
            if (it.end >= it.start) {
                if ((it.start <= selectionStart && selectionStart <= it.end) ||
                    (it.start <= selectionEnd && selectionEnd <= it.end) ||
                    (selectionStart <= it.start && it.end <= selectionEnd)) {
                    return true
                }
            }
        }
        return false
    }
}

class PullRequestCommentAction(
    val name: String,
    val isReview: Boolean,
    val editor: Editor,
    val line: Int,
    val onClick: () -> Unit
) : AnAction(name) {
    override fun actionPerformed(e: AnActionEvent) {
        editor.inlineTextFieldManager?.showTextField(isReview, line)
    }
}

class NewInlineCodemarkGutterIconRendererClickAction(
    val editor: Editor,
    val line: Int,
    val onClick: () -> Unit
) :
    DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        editor.inlineTextFieldManager?.showTextField(false, line)
    }
}

class NewCodemarkGutterIconRendererDraggableObject(
    private val editor: Editor,
    private val originalLine: Int,
    private val onStopDrag: () -> Unit
) : GutterDraggableObject {

    override fun copy(line: Int, file: VirtualFile?, actionId: Int): Boolean {
        val project = editor.project
        onStopDrag()
        ApplicationManager.getApplication().invokeLater {
            project?.codeStream?.show {
                project.webViewService?.postNotification(
                    CodemarkNotifications.New(
                        editor.document.uri,
                        editor.selectionOrCurrentLine,
                        CodemarkType.COMMENT,
                        "Gutter"
                    )
                )
            }
        }
        return true
    }

    override fun getCursor(line: Int, actionId: Int): Cursor {
        ApplicationManager.getApplication().invokeLater {
            if (line < originalLine) {
                val startOffset = editor.document.getLineStartOffset(line)
                val endOffset = editor.document.getLineEndOffset(originalLine)
                editor.selectionModel.setSelection(startOffset, endOffset)
            } else {
                val startOffset = editor.document.getLineStartOffset(originalLine)
                val endOffset = editor.document.getLineEndOffset(line)
                editor.selectionModel.setSelection(startOffset, endOffset)
            }
        }
        return DragSource.DefaultMoveDrop
    }

    override fun remove() {
        onStopDrag()
    }
}
