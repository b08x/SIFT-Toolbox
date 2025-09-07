

import { marked } from 'marked';

export const downloadMarkdown = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadPdfWithBrowserPrint = (markdownContent: string, filename: string, printWindow: Window) => {
    if (!printWindow || printWindow.closed) {
        console.error("Print window is not available or has been closed.");
        // The caller (App.tsx) is responsible for alerting the user if the window couldn't be opened initially.
        return;
    }

    const htmlContent = marked.parse(markdownContent);
    const printDoc = printWindow.document;

    // Write the full document, including styles and a script to trigger printing.
    printDoc.open();
    printDoc.write(`
        <html>
            <head>
                <title>${filename.replace('.pdf', '')}</title>
                <style>
                    /* Print-friendly styles */
                    @media print {
                        @page { 
                            margin: 1.5cm;
                            size: A4;
                        }
                        body { 
                            -webkit-print-color-adjust: exact; 
                            print-color-adjust: exact;
                        }
                    }
                    body { 
                        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                        line-height: 1.5; 
                        color: #333;
                        font-size: 10pt;
                    }
                    h1, h2, h3, h4, h5, h6 { 
                        font-family: 'Georgia', 'Times New Roman', Times, serif; 
                        margin-top: 1.5em;
                        margin-bottom: 0.5em;
                        font-weight: 600;
                        color: #111;
                        page-break-after: avoid;
                    }
                    h1 { 
                        font-size: 24pt; 
                        font-weight: 700;
                        border-bottom: 2px solid #333; 
                        padding-bottom: 0.3em;
                    }
                    h2 { 
                        font-size: 18pt; 
                        border-bottom: 1px solid #ccc; 
                        padding-bottom: 0.3em; 
                    }
                    h3 { 
                        font-size: 14pt; 
                        color: #222;
                    }
                    h4 {
                        font-size: 11pt;
                        font-weight: bold;
                        color: #444;
                    }
                    pre, code { 
                        background-color: #f5f5f5; 
                        padding: 0.2em 0.4em; 
                        border-radius: 4px; 
                        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
                        font-size: 0.9em;
                        border: 1px solid #e1e1e1;
                        white-space: pre-wrap;
                        word-break: break-word;
                        page-break-inside: avoid;
                    }
                    pre { 
                        padding: 1em; 
                        overflow-x: auto; 
                    }
                    blockquote { 
                        border-left: 3px solid #ddd; 
                        padding-left: 1em; 
                        margin-left: 0; 
                        color: #555; 
                        font-style: italic;
                    }
                    table { 
                        border-collapse: collapse; 
                        width: 100%; 
                        margin-bottom: 1.5em;
                        font-size: 9pt; 
                        page-break-inside: avoid;
                    }
                    th, td { 
                        border: 1px solid #ddd; 
                        padding: 8px; 
                        text-align: left;
                        vertical-align: top;
                    }
                    th { 
                        background-color: #f7f7f7; 
                        font-weight: bold;
                    }
                    img { 
                        max-width: 100%; 
                        height: auto;
                        border-radius: 4px;
                    }
                    a {
                        color: #0066cc;
                        text-decoration: none;
                        word-break: break-all;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                    ul, ol {
                        padding-left: 1.5em;
                    }
                    li {
                        margin-bottom: 0.5em;
                    }
                    hr {
                        border: none;
                        border-top: 1px solid #ccc;
                        margin: 2em 0;
                    }
                </style>
                <script>
                    window.onload = function() {
                        // A short delay ensures all content is rendered before printing
                        setTimeout(function() {
                            window.focus();
                            window.print();
                        }, 200);
                    };
                </script>
            </head>
            <body>${htmlContent}</body>
        </html>
    `);
    printDoc.close();
};