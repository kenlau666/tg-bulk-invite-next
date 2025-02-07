import type { NextApiRequest, NextApiResponse } from 'next';
import { Api } from "telegram";
import { activeClients } from './connect';

type ResponseData = {
  success: boolean;
  message: string;
  participants?: any[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { sourceGroups, targetGroup, sessionId } = req.body;

  try {
    const clientData = activeClients.get(sessionId);
    if (!clientData) {
      return res.status(400).json({
        success: false,
        message: "No active session found"
      });
    }

    const { client } = clientData;
    const allParticipants: any[] = [];
    let invitedCount = 0;

    // Get target group participants first to check membership
    const targetGroupName = targetGroup.replace('https://t.me/', '');
    const targetParticipants = await client.getParticipants(targetGroupName);
    const targetMemberIds = new Set(targetParticipants?.map(p => p.id) || []);

    // Get participants from each source group
    for (const groupLink of sourceGroups) {
      try {
        const participants = await client.getParticipants(groupLink.replace('https://t.me/', ''));
        
        if (participants) {
          // For each participant, process and invite if needed
          for (const participant of participants) {
            try {
              // Skip if already in target group
              if (targetMemberIds.has(participant.id)) {
                console.log(`${participant.firstName || "User"} is already in target group`);
                continue;
              }

              // Check if user is already in contacts
              const contact = await client.invoke(new Api.contacts.GetContacts({}));
              const contactsResult = contact as any;  // Type assertion for now
              
              const isContact = contactsResult.users?.some((u: any) => u.id === participant.id) || false;

              if (!isContact && participant.phone) {
                // Add to contacts if not already added
                await client.invoke(new Api.contacts.AddContact({
                  id: participant.id,
                  firstName: participant.firstName || "User",
                  lastName: participant.lastName || "",
                  phone: participant.phone,
                  addPhonePrivacyException: true
                }));
                console.log(`Added ${participant.firstName || "User"} to contacts`);
              }

              // Invite to target group
              try {
                await client.invoke(new Api.channels.InviteToChannel({
                  channel: targetGroupName,
                  users: [participant.id]
                }));
                invitedCount++;
                console.log(`Invited ${participant.firstName || "User"} to target group`);
              } catch (inviteError) {
                console.error(`Failed to invite ${participant.firstName || "User"}:`, inviteError);
              }

              allParticipants.push(participant);
            } catch (error) {
              console.error(`Error processing participant ${participant.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error getting participants from ${groupLink}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${allParticipants.length} participants, invited ${invitedCount} new members`,
      participants: allParticipants
    });

  } catch (error) {
    console.error('Error getting participants:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get participants'
    });
  }
}
