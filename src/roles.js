/* Danh mục vai trò dùng chung cho bot, server và Mini App */
const ROLES = {
  giam_doc: 'Giám đốc',
  to_sx: 'Tổ sản xuất',
  ban_hang: 'Nhân viên bán hàng',
  thu_mua: 'Nhân viên thu mua'
};

// Vai trò được phép chỉnh sửa (đổi ưu tiên, giờ giao, tiến độ).
const EDIT_ROLES = ['giam_doc', 'to_sx'];

function roleLabel(r) { return ROLES[r] || 'Chưa đăng ký'; }

module.exports = { ROLES, EDIT_ROLES, roleLabel };
