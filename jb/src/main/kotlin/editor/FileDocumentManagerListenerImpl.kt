package com.codestream.editor

import com.codestream.editorService
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManagerListener
import com.intellij.openapi.project.Project

class FileDocumentManagerListenerImpl(val project: Project) : FileDocumentManagerListener {
    override fun beforeDocumentSaving(document: Document) {
        try {
            project.editorService?.save(document)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}