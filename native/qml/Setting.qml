import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: row
    property string title
    property string description
    default property alias controls: actions.data
    Layout.fillWidth: true
    implicitHeight: body.implicitHeight+40
    radius: 16
    color: Backend.colors.surface
    border.color: Backend.colors.line
    RowLayout {
        id: body
        anchors.fill: parent; anchors.margins: 20
        Layout.fillWidth: true
        spacing: 24
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 5
            Text { text: row.title; color: Backend.colors.ink; font.pixelSize: 15; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Text { text: row.description; visible: text.length > 0; color: Backend.colors.muted; font.pixelSize: 12; Layout.fillWidth: true; wrapMode: Text.Wrap; lineHeight: 1.25 }
        }
        RowLayout { id: actions; spacing: 8; Layout.alignment: Qt.AlignVCenter }
    }
}
