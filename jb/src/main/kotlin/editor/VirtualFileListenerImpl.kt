package com.codestream.editor

import com.codestream.editorService
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileEvent
import com.intellij.openapi.vfs.VirtualFileListener

class VirtualFileListenerImpl(val project: Project) : VirtualFileListener {
    override fun contentsChanged(event: VirtualFileEvent) {
        try {
            val document = FileDocumentManager.getInstance().getDocument(event.file)
            if (event.isFromSave && document != null) {
                project.editorService?.save(document)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}