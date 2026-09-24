package com.zhl.builder.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** ZHL 品牌色（与介绍站/状态页一致：深空底 + 磷光青） */
object ZhlColors {
    val bg = Color(0xFF05090F)
    val panel = Color(0xFF0C1420)
    val panel2 = Color(0xFF101A28)
    val line = Color(0xFF1B2839)
    val txt = Color(0xFFE6EDF6)
    val dim = Color(0xFF8CA0B8)
    val faint = Color(0xFF5A6E86)
    val accent = Color(0xFF22D3EE)
    val ok = Color(0xFF34D399)
    val warn = Color(0xFFFBBF24)
    val down = Color(0xFFF87171)
}

@Composable
fun ZhlScreen(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(ZhlColors.bg)) {
        Column(Modifier.fillMaxSize().padding(20.dp)) { content() }
    }
}

@Composable
fun ZhlTitle() {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
        Box(
            Modifier.size(34.dp).background(Color(0xFF123047), RoundedCornerShape(9.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("ZB", color = ZhlColors.accent, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.width(10.dp))
        Text("ZHLBuilder", color = ZhlColors.txt, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(8.dp))
        Text("设备", color = ZhlColors.faint, fontSize = 13.sp)
    }
}

@Composable
fun StatusDot(online: Boolean) {
    Box(
        Modifier.size(9.dp).background(if (online) ZhlColors.ok else ZhlColors.faint, CircleShape),
    )
}

@Composable
fun InfoCard(title: String, subtitle: String, modifier: Modifier = Modifier,
             trailing: @Composable (() -> Unit)? = null) {
    Card(
        colors = CardDefaults.cardColors(containerColor = ZhlColors.panel),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = ZhlColors.txt, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                if (subtitle.isNotBlank()) {
                    Text(subtitle, color = ZhlColors.dim, fontSize = 12.5.sp, modifier = Modifier.padding(top = 3.dp))
                }
            }
            trailing?.invoke()
        }
    }
}

@Composable
fun AccentButton(text: String, enabled: Boolean = true, loading: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        colors = ButtonDefaults.buttonColors(
            containerColor = ZhlColors.accent,
            contentColor = Color(0xFF06222B),
        ),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth().height(46.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Color(0xFF06222B), strokeWidth = 2.dp)
        } else {
            Text(text, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun ZhlField(value: String, onValue: (String) -> Unit, hint: String, obscure: Boolean = false) {
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        placeholder = { Text(hint, color = ZhlColors.faint) },
        visualTransformation = if (obscure) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        singleLine = true,
        shape = RoundedCornerShape(10.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = ZhlColors.accent,
            unfocusedBorderColor = ZhlColors.line,
            focusedTextColor = ZhlColors.txt,
            unfocusedTextColor = ZhlColors.txt,
            cursorColor = ZhlColors.accent,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** 简易纵向列表容器 */
@Composable
fun ZhlList(items: List<@Composable () -> Unit>) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(items.size) { i -> items[i]() }
    }
}
