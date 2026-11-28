import QtQuick
import QtQuick.Controls
TextField {
    id: field
    implicitHeight: 42
    font.pixelSize: 14
    color: Backend.colors.ink
    placeholderTextColor: Backend.colors.muted
    selectionColor: Backend.colors.accent
    selectByMouse: true
    leftPadding: 14; rightPadding: 14
    background: Rectangle { radius: 9; color: Backend.colors.surface; border.color: field.activeFocus ? Backend.colors.accent : Backend.colors.line }
}
