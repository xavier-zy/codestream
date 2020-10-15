package com.codestream.editor

import com.codestream.agentService
import com.codestream.codeStream
import com.codestream.extensions.ifNullOrBlank
import com.codestream.extensions.uri
import com.codestream.protocols.agent.DocumentMarker
import com.codestream.protocols.agent.TelemetryParams
import com.codestream.protocols.webview.CodemarkNotifications
import com.codestream.protocols.webview.PullRequestNotifications
import com.codestream.webViewService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

class GutterIconRendererImpl(val editor: Editor, val marker: DocumentMarker) : GutterIconRenderer() {
    val id: String
        get() = marker.id

    override fun isNavigateAction(): Boolean {
        return true
    }

    override fun getClickAction(): AnAction = GutterIconAction(editor, marker)

    override fun getTooltipText(): String? {
        return marker.summary
    }

    override fun getIcon(): Icon {
        val type = marker.type.ifNullOrBlank { "comment" }
        val color = marker.codemark?.color.ifNullOrBlank { "blue" }
        return IconLoader.getIcon("/images/marker-$type-$color.svg")
    }

    override fun equals(other: Any?): Boolean {
        val otherRenderer = other as? GutterIconRendererImpl ?: return false
        return id == otherRenderer.id
    }

    override fun hashCode(): Int {
        return id.hashCode()
    }
}

class GutterIconAction(val editor: Editor, val marker: DocumentMarker) : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = editor.project ?: return
        marker.codemark?.let {
            project.codeStream?.show {
                project.webViewService?.postNotification(
                    CodemarkNotifications.Show(
                        it.id,
                        editor.document.uri
                    )
                )
            }
            telemetry(project, TelemetryEvent.CODEMARK_CLICKED)
        }
        marker.externalContent?.let {
            it.provider?.let { provider ->
                project.webViewService?.postNotification(
                    PullRequestNotifications.Show(
                        provider.id,
                        it.externalId,
                        it.externalChildId
                    )
                )
            }
            telemetry(project, TelemetryEvent.PR_CLICKED)
        }
    }
}

private enum class TelemetryEvent(val value: String, val properties: Map<String, String>) {
    CODEMARK_CLICKED("Codemark Clicked", mapOf("Codemark Location" to "Source File", "Comment Location" to "Diff Gutter")),
    PR_CLICKED("PR Comment Clicked", mapOf("PullRequest Location" to "Source File", "Comment Location" to "Diff Gutter"))
}

private fun telemetry(project: Project, event: TelemetryEvent) {
    val params = TelemetryParams(event.value, event.properties)
    project.agentService?.agent?.telemetry(params)
}
