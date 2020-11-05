package com.codestream.editor

import com.codestream.codeStream
import com.codestream.extensions.selectionOrCurrentLine
import com.codestream.extensions.uri
import com.codestream.protocols.CodemarkType
import com.codestream.protocols.webview.CodemarkNotifications
import com.codestream.webViewService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.GutterDraggableObject
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import java.awt.Cursor
import java.awt.dnd.DragSource
import javax.swing.Icon

val ICON = IconLoader.getIcon("/images/add-comment.svg")

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

    override fun getClickAction(): AnAction {
        return NewCodemarkGutterIconRendererClickAction(editor, line, onClick)
    }

    override fun getDraggableObject(): GutterDraggableObject {
        onStartDrag()
        return NewCodemarkGutterIconRendererDraggableObject(editor, this.line, onStopDrag)
    }
}

class NewCodemarkGutterIconRendererClickAction(val editor: Editor, val line: Int, val onClick: () -> Unit) :
    DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        ApplicationManager.getApplication().invokeLater {
            val project = editor.project
            if (!editor.selectionModel.hasSelection()) {
                val startOffset = editor.document.getLineStartOffset(line)
                val endOffset = editor.document.getLineEndOffset(line)
                editor.selectionModel.setSelection(startOffset, endOffset)
            }
            project?.codeStream?.show {
                project.webViewService?.postNotification(
                    CodemarkNotifications.New(
                        editor.document.uri,
                        editor.selectionOrCurrentLine,
                        CodemarkType.COMMENT,
                        "Gutter"
                    )
                )
                onClick()
            }
        }
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
