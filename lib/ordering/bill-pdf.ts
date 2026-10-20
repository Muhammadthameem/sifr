import PDFDocument from 'pdfkit';
import { AdminOrderDetailResult } from './order-query';
import { StoreSettingsData } from '@/lib/settings/settings-service';

/**
 * Formats a number as Indian currency representation without unmapped glyphs.
 * Uses "Rs. 1,234.56" format which is universally supported across all PDF engines.
 */
function formatPdfCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount;
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats an ISO date string cleanly for the bill header.
 */
function formatBillDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Pure, deterministic on-demand PDF generator for SIFR customer bills.
 * Uses persisted snapshots only. Never exposes internal database IDs,
 * credentials, inventory FIFO layers, or technical internals.
 */
export async function generateOrderBillPdf(
  order: AdminOrderDetailResult,
  settings?: Partial<StoreSettingsData> | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `SIFR Bill - ${order.orderNumber}`,
          Author: settings?.businessName || 'SIFR',
          Subject: `Tax Invoice for Order ${order.orderNumber}`,
          Creator: 'SIFR Commerce Engine',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const left = 40;
      const right = pageWidth - 40; // 555.28
      const contentWidth = right - left; // 515.28

      // --------------------------------------------------
      // 1. BRAND HEADER & INVOICE METADATA
      // --------------------------------------------------
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#111111')
        .text((settings?.businessName || 'SIFR').toUpperCase(), left, 40, {
          characterSpacing: 3,
        });

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#666666')
        .text(settings?.tagline || 'Contemporary Fashion & Accessories', left, 68);

      const contactLine = [
        settings?.address || 'Calicut, Kerala, India',
        settings?.email || 'support@sifr.in',
        settings?.phone || null,
      ]
        .filter(Boolean)
        .join('  •  ');

      doc.fontSize(8).fillColor('#777777').text(contactLine, left, 80);
      doc
        .fontSize(8)
        .fillColor('#777777')
        .text(`Website: ${settings?.storeDomain || 'sifr.in'}`, left, 92);

      // Right-aligned Invoice Meta Block
      const metaBoxX = 330;
      const metaBoxWidth = right - metaBoxX;

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#111111')
        .text('TAX INVOICE / BILL', metaBoxX, 40, {
          width: metaBoxWidth,
          align: 'right',
        });

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#222222')
        .text(`Bill No: ${order.orderNumber}`, metaBoxX, 58, {
          width: metaBoxWidth,
          align: 'right',
        });

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#555555')
        .text(`Date: ${formatBillDate(order.confirmedAt || order.createdAt)}`, metaBoxX, 72, {
          width: metaBoxWidth,
          align: 'right',
        });

      doc.text(`Order Status: ${order.status}`, metaBoxX, 85, {
        width: metaBoxWidth,
        align: 'right',
      });

      const paymentLabel = `Payment: ${order.paymentStatus} (${order.paymentMethod || 'COD'})`;
      doc.text(paymentLabel, metaBoxX, 98, {
        width: metaBoxWidth,
        align: 'right',
      });

      // Divider line
      doc
        .strokeColor('#E5E5E5')
        .lineWidth(1)
        .moveTo(left, 115)
        .lineTo(right, 115)
        .stroke();

      // --------------------------------------------------
      // 2. CUSTOMER & DELIVERY ADDRESS
      // --------------------------------------------------
      const addressTop = 127;
      const colWidth = 245;

      // Customer Column
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#555555')
        .text('BILLED TO / CUSTOMER', left, addressTop, { characterSpacing: 0.5 });

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111111')
        .text(order.customerNameSnapshot || 'Customer', left, addressTop + 14);

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#444444')
        .text(`Mobile: ${order.customerMobileSnapshot}`, left, addressTop + 28);

      if (order.customerEmailSnapshot) {
        doc.text(`Email: ${order.customerEmailSnapshot}`, left, addressTop + 40);
      }

      // Delivery Address Column
      const rightColX = 300;
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#555555')
        .text('DELIVERY ADDRESS', rightColX, addressTop, { characterSpacing: 0.5 });

      const addrLines: string[] = [];
      if (order.customerAddress.address && order.customerAddress.address !== '—') {
        addrLines.push(order.customerAddress.address);
      }
      const cityStateParts: string[] = [];
      if (order.customerAddress.city && order.customerAddress.city !== '—') {
        cityStateParts.push(order.customerAddress.city);
      }
      if (order.customerAddress.state && order.customerAddress.state !== '—') {
        cityStateParts.push(order.customerAddress.state);
      }
      if (order.customerAddress.pincode && order.customerAddress.pincode !== '—') {
        cityStateParts.push(`PIN: ${order.customerAddress.pincode}`);
      }

      if (cityStateParts.length > 0) {
        addrLines.push(cityStateParts.join(', '));
      }

      if (addrLines.length === 0) {
        addrLines.push(order.shippingAddressSnapshot || 'As per customer record');
      }

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#333333')
        .text(addrLines.join('\n'), rightColX, addressTop + 14, {
          width: right - rightColX,
          lineGap: 2,
        });

      // Divider line before items table
      const tableTop = 205;
      doc
        .strokeColor('#E5E5E5')
        .lineWidth(1)
        .moveTo(left, tableTop - 10)
        .lineTo(right, tableTop - 10)
        .stroke();

      // --------------------------------------------------
      // 3. ITEMS TABLE
      // --------------------------------------------------
      const thHeight = 22;
      doc
        .rect(left, tableTop, contentWidth, thHeight)
        .fill('#F7F7F7');

      // Table Header Coordinates
      const colItem = left + 6; // Item details: width 195
      const colSku = left + 205; // SKU: width 125
      const colQty = left + 335; // Qty: width 35, centered
      const colPrice = left + 375; // Price: width 65, right
      const colTotal = left + 445; // Total: width 65, right

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#333333')
        .text('ITEM DETAILS', colItem, tableTop + 7)
        .text('SKU', colSku, tableTop + 7)
        .text('QTY', colQty, tableTop + 7, { width: 35, align: 'center' })
        .text('UNIT PRICE', colPrice, tableTop + 7, { width: 65, align: 'right' })
        .text('TOTAL', colTotal, tableTop + 7, { width: 65, align: 'right' });

      let currentY = tableTop + thHeight;

      order.items.forEach((item, index) => {
        const rowHeight = 28;

        // Subtle alternating row background or clean divider
        if (index % 2 === 1) {
          doc.rect(left, currentY, contentWidth, rowHeight).fill('#FAFAFA');
        }

        // Product Name & Variant/Options
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#111111')
          .text(item.productNameSnapshot, colItem, currentY + 5, {
            width: 195,
            ellipsis: true,
          });

        const variantSubtitle = item.variantTitleSnapshot
          ? `Size/Variant: ${item.variantTitleSnapshot}`
          : 'Standard';

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#777777')
          .text(variantSubtitle, colItem, currentY + 16, { width: 195 });

        // SKU
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#555555')
          .text(item.skuSnapshot || '—', colSku, currentY + 8, { width: 125 });

        // Quantity
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#111111')
          .text(String(item.quantity), colQty, currentY + 8, {
            width: 40,
            align: 'center',
          });

        // Unit Price
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#333333')
          .text(formatPdfCurrency(item.unitPrice), colPrice, currentY + 8, {
            width: 60,
            align: 'right',
          });

        // Line Total
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#111111')
          .text(formatPdfCurrency(item.lineTotal), colTotal, currentY + 8, {
            width: 62,
            align: 'right',
          });

        currentY += rowHeight;

        // Bottom border for item
        doc
          .strokeColor('#EEEEEE')
          .lineWidth(0.5)
          .moveTo(left, currentY)
          .lineTo(right, currentY)
          .stroke();
      });

      // --------------------------------------------------
      // 4. FINANCIAL SUMMARY & PAYMENT SECTION
      // --------------------------------------------------
      const summaryTop = currentY + 14;

      // Payment Box on Left
      const payBoxX = left;
      const payBoxWidth = 240;
      doc
        .rect(payBoxX, summaryTop, payBoxWidth, 75)
        .fillAndStroke('#FBFBFB', '#EAEAEA');

      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#333333')
        .text('PAYMENT DETAILS', payBoxX + 12, summaryTop + 10, { characterSpacing: 0.5 });

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(`Method: `, payBoxX + 12, summaryTop + 26, { continued: true })
        .font('Helvetica-Bold')
        .fillColor('#111111')
        .text(order.paymentMethod || 'Cash On Delivery (COD)');

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(`Status: `, payBoxX + 12, summaryTop + 38, { continued: true })
        .font('Helvetica-Bold')
        .fillColor(order.paymentStatus === 'PAID' ? '#047857' : '#B45309')
        .text(order.paymentStatus);

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#777777')
        .text(
          order.paymentStatus === 'PAID'
            ? '✓ Payment successfully confirmed.'
            : 'Amount due on delivery or collection.',
          payBoxX + 12,
          summaryTop + 54
        );

      // Financial Totals Table on Right
      const sumLabelsX = 330;
      const sumValuesX = 430;
      const sumValWidth = right - sumValuesX;

      let sumY = summaryTop;

      // Subtotal
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#555555')
        .text('Subtotal', sumLabelsX, sumY)
        .font('Helvetica')
        .fillColor('#111111')
        .text(formatPdfCurrency(order.subtotal), sumValuesX, sumY, {
          width: sumValWidth,
          align: 'right',
        });

      // Discount (if any)
      if (order.discountTotal && Number(order.discountTotal) > 0) {
        sumY += 15;
        const couponSuffix = order.couponCodeSnapshot
          ? ` (${order.couponCodeSnapshot})`
          : '';
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#047857')
          .text(`Discount${couponSuffix}`, sumLabelsX, sumY)
          .text(`-${formatPdfCurrency(order.discountTotal)}`, sumValuesX, sumY, {
            width: sumValWidth,
            align: 'right',
          });
      }

      // Shipping
      sumY += 15;
      const shippingStr =
        Number(order.shippingFee) > 0 ? formatPdfCurrency(order.shippingFee) : 'FREE';
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#555555')
        .text('Shipping Fee', sumLabelsX, sumY)
        .fillColor('#111111')
        .text(shippingStr, sumValuesX, sumY, {
          width: sumValWidth,
          align: 'right',
        });

      // Grand Total Divider
      sumY += 16;
      doc
        .strokeColor('#222222')
        .lineWidth(1)
        .moveTo(sumLabelsX, sumY)
        .lineTo(right, sumY)
        .stroke();

      sumY += 7;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#111111')
        .text('Grand Total', sumLabelsX, sumY)
        .text(formatPdfCurrency(order.grandTotal), sumValuesX, sumY, {
          width: sumValWidth,
          align: 'right',
        });

      // --------------------------------------------------
      // 5. FOOTER
      // --------------------------------------------------
      const footerY = 760;
      doc
        .strokeColor('#E5E5E5')
        .lineWidth(0.75)
        .moveTo(left, footerY)
        .lineTo(right, footerY)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#222222')
        .text('Thank you for shopping with SIFR.', left, footerY + 12, {
          align: 'center',
          width: contentWidth,
        });

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#888888')
        .text(
          'For assistance or support with your order, please write to us at support@sifr.in',
          left,
          footerY + 26,
          {
            align: 'center',
            width: contentWidth,
          }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
