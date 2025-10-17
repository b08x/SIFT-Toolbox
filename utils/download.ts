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

export const downloadHtml = (htmlContent: string, filename: string) => {
  const styledHtml = `
      <!DOCTYPE html>
      <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${filename.replace('.html', '')}</title>
              <style>
                  body {
                      font-family: Georgia, 'Times New Roman', Times, serif;
                      line-height: 1.7;
                      color: #333;
                      background-color: #fcfcfc;
                      padding: 40px;
                      max-width: 720px;
                      margin: 40px auto;
                  }
                  h1, h2, h3, h4, h5, h6 {
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                      margin-top: 2em;
                      margin-bottom: 1em;
                      font-weight: 600;
                      line-height: 1.3;
                      color: #111;
                  }
                  h1 { font-size: 2.2em; border-bottom: 2px solid #111; padding-bottom: .4em; }
                  h2 { font-size: 1.6em; border-bottom: 1px solid #ddd; padding-bottom: .4em; }
                  h3 { font-size: 1.3em; }
                  p { margin-bottom: 1.2em; }
                  ul, ol { padding-left: 2em; margin-bottom: 1.2em; }
                  li { margin-bottom: 0.5em; }
                  table { border-collapse: collapse; width: 100%; margin: 2em 0; display: block; overflow: auto; }
                  th, td { border: 1px solid #dfe2e5; padding: 8px 15px; }
                  th { font-weight: 600; background-color: #f6f8fa; }
                  pre, code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; font-size: 0.9em; }
                  code { background-color: rgba(27,31,35,.07); padding: .2em .4em; border-radius: 4px; }
                  pre { background-color: #f6f8fa; border-radius: 4px; padding: 16px; overflow: auto; line-height: 1.45; }
                  pre code { background: none; padding: 0; }
                  blockquote {
                      color: #444;
                      border-left: 3px solid #ccc;
                      padding-left: 1.5em;
                      margin: 2.5em 0;
                      font-style: normal;
                  }
                  blockquote p {
                      margin-bottom: 0.5em;
                  }
                  blockquote p:last-child {
                    margin-bottom: 0;
                  }
                  a {
                      color: #1452A3;
                      text-decoration: none;
                      border-bottom: 1px solid #e0e0e0;
                      transition: border-bottom-color 0.2s ease-in-out;
                  }
                  a:hover {
                      border-bottom-color: #1452A3;
                  }
                  img { max-width: 100%; height: auto; border-radius: 4px; margin: 1.5em 0; }
                  hr {
                      border: none;
                      border-top: 1px solid #ddd;
                      margin: 2.5em auto;
                      width: 50%;
                  }
              </style>
          </head>
          <body>
              ${htmlContent}
          </body>
      </html>
  `;
  const blob = new Blob([styledHtml], { type: 'text/html;charset=utf-8;' });
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