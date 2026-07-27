import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { SourceAssessment } from '../types.ts';

interface D3GraphViewProps {
    sources: SourceAssessment[];
    onNodeClick?: (nodeId: string) => void;
}

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    group: 'Topic' | 'Category' | 'Source' | 'Claim';
    radius: number;
    color: string;
    label: string;
    detail?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    value: number;
}

const categorizeSource = (source: SourceAssessment): string => {
    const text = (source.assessment + " " + source.notes + " " + source.name).toLowerCase();
    if (text.includes('fact-check') || text.includes('fact check') || text.includes('snopes') || text.includes('politifact') || text.includes('reuters fact check') || text.includes('ap news fact check') || text.includes('factchecker')) {
        return 'Fact-Checkers';
    }
    if (text.includes('primary source') || text.includes('original report') || text.includes('official document') || text.includes('eyewitness') || text.includes('direct quote') || text.includes('government') || text.includes('academic') || text.includes('peer-reviewed')) {
        return 'Primary Sources';
    }
    return 'Secondary Reports';
};

const extractPseudoClaim = (text: string): string => {
    if (!text) return "Unspecified claim";
    const sentences = text.split(/[.?!]/);
    const firstSentence = sentences[0].trim();
    if (firstSentence.length > 60) {
        return firstSentence.substring(0, 57) + "...";
    }
    return firstSentence || "Unspecified claim";
};

export const D3GraphView: React.FC<D3GraphViewProps> = ({ sources, onNodeClick }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, text: string, detail?: string }>({ visible: false, x: 0, y: 0, text: '' });

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', [0, 0, width, height]);
        
        // Background rect to capture pan/zoom events reliably across the whole SVG
        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .style('fill', 'none')
            .style('pointer-events', 'all');

        // Add a zoom group
        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        
        svg.call(zoom);

        // Data processing
        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];

        // Center Topic
        const TOPIC_ID = 'Investigation';
        nodes.push({ id: TOPIC_ID, group: 'Topic', radius: 25, color: '#A42A27', label: 'Investigation' });

        const categories = Array.from(new Set(sources.map(categorizeSource)));
        
        categories.forEach(cat => {
            const catId = `cat_${cat}`;
            nodes.push({ id: catId, group: 'Category', radius: 20, color: '#3A7CB0', label: cat });
            links.push({ source: TOPIC_ID, target: catId, value: 2 });
        });

        sources.forEach(source => {
            const cat = categorizeSource(source);
            const catId = `cat_${cat}`;
            const sourceId = `src_${source.index}`;
            const claimId = `claim_${source.index}`;
            const claimText = extractPseudoClaim(source.assessment);

            const ratingVal = parseFloat(source.rating);
            let sourceColor = '#666666';
            if (ratingVal >= 4) sourceColor = '#6FA862'; // green
            else if (ratingVal >= 2.5) sourceColor = '#2B638A'; // blue/amber
            else sourceColor = '#A42A27'; // red

            nodes.push({ id: sourceId, group: 'Source', radius: 15, color: sourceColor, label: source.name, detail: `Rating: ${source.rating}/5\nNotes: ${source.notes}` });
            links.push({ source: catId, target: sourceId, value: 1 });

            // Create a claim node if it's meaningful
            nodes.push({ id: claimId, group: 'Claim', radius: 10, color: '#A3A3A3', label: claimText, detail: source.assessment });
            links.push({ source: sourceId, target: claimId, value: 1 });
        });

        const simulation = d3.forceSimulation<GraphNode>(nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
                if (d.source === TOPIC_ID || (d.source as GraphNode).id === TOPIC_ID) return 100;
                if ((d.source as GraphNode).group === 'Category' || (d.target as GraphNode).group === 'Category') return 70;
                return 50;
            }))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide<GraphNode>().radius(d => d.radius + 5));

        const link = g.append('g')
            .attr('stroke', '#4B5563')
            .attr('stroke-opacity', 0.6)
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke-width', d => Math.sqrt(d.value));

        const node = g.append('g')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('g')
            .data(nodes)
            .join('g')
            .call(d3.drag<SVGGElement, GraphNode>()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended) as any);

        node.append('circle')
            .attr('r', d => d.radius)
            .attr('fill', d => d.color)
            .on('mouseover', function(event, d) {
                setTooltip({ visible: true, x: event.pageX, y: event.pageY, text: d.label, detail: d.detail });
                d3.select(this).attr('stroke', '#fff').attr('stroke-width', 3);
                d3.select(this.parentNode as Element).select('text').style('opacity', 1);
            })
            .on('mousemove', (event) => {
                setTooltip(prev => ({ ...prev, x: event.pageX, y: event.pageY }));
            })
            .on('mouseout', function(event, d) {
                setTooltip(prev => ({ ...prev, visible: false }));
                d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1.5);
                if (d.group !== 'Topic' && d.group !== 'Category') {
                    d3.select(this.parentNode as Element).select('text').style('opacity', 0);
                }
            })
            .on('click', (event, d) => {
                if (onNodeClick && d.group === 'Source') {
                    onNodeClick(d.id.replace('src_', ''));
                }
            });

        node.append('text')
            .attr('dy', d => d.radius + 12)
            .attr('text-anchor', 'middle')
            .text(d => d.label.length > 20 ? d.label.substring(0, 17) + '...' : d.label)
            .attr('font-size', '10px')
            .attr('fill', 'var(--text-color)')
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('opacity', d => d.group === 'Topic' || d.group === 'Category' ? 1 : 0);

        simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as GraphNode).x!)
                .attr('y1', d => (d.source as GraphNode).y!)
                .attr('x2', d => (d.target as GraphNode).x!)
                .attr('y2', d => (d.target as GraphNode).y!);

            node
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        function dragstarted(event: any, d: GraphNode) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event: any, d: GraphNode) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event: any, d: GraphNode) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        return () => {
            simulation.stop();
        };
    }, [sources, onNodeClick]);

    return (
        <div className="w-full h-full relative" ref={containerRef}>
            <svg ref={svgRef} className="w-full h-full bg-background" />
            {tooltip.visible && (
                <div 
                    className="absolute pointer-events-none bg-content border border-ui p-2 rounded shadow-lg z-50 max-w-xs"
                    style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}
                >
                    <div className="font-bold text-sm text-main">{tooltip.text}</div>
                    {tooltip.detail && (
                        <div className="text-xs text-light mt-1 whitespace-pre-wrap">{tooltip.detail}</div>
                    )}
                </div>
            )}
        </div>
    );
};
